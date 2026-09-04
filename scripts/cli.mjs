#!/usr/bin/env node
/**
 * dsh-learn 统一安装入口：一条命令同时安装/更新/卸载 skills 和 DSH 插件。
 *
 *   dsh-learn                       # 安装 + 更新（skills -> ~/.agents/skills，bundle -> DSH profile）
 *   dsh-learn --project             # skills 装到当前项目 .agents/skills（bundle 仍装到 DSH）
 *   dsh-learn --skills-only         # 只装/更新 skills（ZCode 等无 DSH 环境）
 *   dsh-learn --bundle-only         # 只装/更新 DSH 插件
 *   dsh-learn --profile <name>      # 指定 DSH profile（缺省自动选择）
 *   dsh-learn --source <路径或spec> # 手动指定插件来源（本地目录 / github:user/repo）
 *   dsh-learn remove                # 卸载 skills + 插件
 *
 * 远端一条命令（推到 GitHub 后）：
 *   npx github:<你的用户名>/dsh-learn-plugin
 */
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const pkgDir = resolve(scriptDir, "..");
const pkg = JSON.parse(readFileSync(join(pkgDir, "package.json"), "utf8"));
const BUNDLE_NAME = pkg.name;

// ---------- 参数解析 ----------
const argv = process.argv.slice(2);
const command = ["install", "update", "remove"].includes(argv[0]) ? argv[0] : "install";
const flags = argv.slice(command === "install" ? 0 : 1);
const opt = (name) => {
	const i = flags.indexOf(name);
	return i >= 0 && flags[i + 1] && !flags[i + 1].startsWith("--") ? flags[i + 1] : undefined;
};
const has = (name) => flags.includes(name);
const skillsOnly = has("--skills-only");
const bundleOnly = has("--bundle-only");
const project = has("--project");
const sourceOverride = opt("--source");
const profileOpt = opt("--profile");

const q = (s) => (/[\\s"]/.test(s) ? `"${s.replace(/"/g, '\\"')}"` : s);
const run = (cmd, opts = {}) => spawnSync(cmd, { shell: true, stdio: "inherit", ...opts });

// ---------- 插件来源解析 ----------
function resolveSource() {
	if (sourceOverride) return { spec: sourceOverride, label: sourceOverride };
	// package.json 的 repository 字段（推到 GitHub 后由 CLI 自动读取）
	const url = pkg.repository?.url || "";
	const gh = url.match(/github\.com[/:]([^/]+)\/([^/.#]+)/);
	if (gh && !/你的用户名|YOUR_GITHUB|username/i.test(gh[1])) {
		return { spec: `github:${gh[1]}/${gh[2]}`, label: `github:${gh[1]}/${gh[2]}` };
	}
	return { spec: pkgDir, label: `${pkgDir}（本地目录）`, local: true };
}

// ---------- DSH profile 选择 ----------
function resolveProfile() {
	if (profileOpt) return profileOpt;
	const profilesDir = join(homedir(), ".dsh", "profiles");
	if (!existsSync(profilesDir)) return null;
	const names = readdirSync(profilesDir).filter((n) => !n.startsWith("."));
	if (names.length === 0) return null;
	if (names.includes("desktop")) return "desktop";
	if (names.length === 1) return names[0];
	console.error(`\n[!] 发现多个 DSH profile：${names.join("、")}`);
	console.error("    请用 --profile <名称> 指定一个。");
	process.exit(1);
}

// ---------- skills ----------
function doSkills(remove) {
	console.log(`\n== ${remove ? "卸载" : "安装/更新"} skills (${project ? "项目级" : "用户级"}) ==`);
	const args = ["scripts/install-skills.mjs"];
	if (project) args.push("--project");
	if (remove) args.push("--remove");
	const r = spawnSync("node", args, { cwd: pkgDir, shell: true, stdio: "inherit" });
	return r.status === 0;
}

// ---------- DSH bundle ----------
function ensureDeps() {
	// 本地目录以 link 方式挂进 profile 时，插件依赖从本目录解析，需先安装
	const marker = join(pkgDir, "node_modules", "@deepseek-ai", "cordis");
	if (existsSync(marker)) return true;
	console.log("\n== 安装插件自身依赖（首次本地安装需要一次）==");
	return run("npm install --omit=dev --no-fund --no-audit", { cwd: pkgDir }).status === 0;
}

function doBundle(remove, update) {
	const profile = resolveProfile();
	const dshOk = spawnSync("dsh --version", { shell: true, stdio: "ignore" }).status === 0;
	if (!profile || !dshOk) {
		console.log("\n== 跳过 DSH 插件 ==" + (!dshOk ? "（未检测到 dsh 命令）" : `（未找到 DSH profile）`));
		return true;
	}
	const { spec, label, local } = resolveSource();
	const act = remove ? "remove" : update ? "update" : "install";
	console.log(`\n== ${act} DSH 插件 -> profile「${profile}」 ==`);
	if (update) {
		// 先移除旧版本再装新的，避免 pnpm 的 git 缓存钉住旧 commit
		run(`dsh plugin --profile ${q(profile)} remove ${BUNDLE_NAME}`);
	}
	let okBundle = true;
	if (remove) {
		okBundle = run(`dsh plugin --profile ${q(profile)} remove ${BUNDLE_NAME}`).status === 0;
	} else {
		if (local && !ensureDeps()) return false;
		if (update) {
			// 先移除旧版本再装新的，避免 pnpm 的 git 缓存钉住旧 commit
			run(`dsh plugin --profile ${q(profile)} remove ${BUNDLE_NAME}`);
		}
		okBundle = run(`dsh plugin --profile ${q(profile)} add ${q(spec)}`).status === 0;
		if (!okBundle && !local) {
			console.warn(`\n[!] 从 ${label} 安装失败，回退为本地目录 ${pkgDir}`);
			okBundle = ensureDeps() && run(`dsh plugin --profile ${q(profile)} add ${q(pkgDir)}`).status === 0;
		}
	}
	return okBundle;
}

// ---------- 主流程 ----------
console.log(`dsh-learn v${pkg.version} — ${command}`);
let ok = true;
if (!bundleOnly) ok = doSkills(command === "remove") && ok;
if (!skillsOnly) ok = doBundle(command === "remove", command === "update") && ok;

if (ok && command !== "remove") {
	console.log(`\n全部完成 ✔`);
	console.log("  开始学习：对 AI 说「我想学 <主题>」或 /learn <主题>");
	console.log("  每天续学：「继续学习」或 /learn-next    复习：「复习」或 /learn-review");
} else if (ok) {
	console.log(`\n已卸载 ✔`);
} else {
	console.log("\n有步骤失败，请检查上方输出。");
	process.exit(1);
}
