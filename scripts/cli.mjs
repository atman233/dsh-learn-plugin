#!/usr/bin/env node
/**
 * dsh-learn 统一安装入口：一条命令同时安装/更新/卸载 skills、命令和插件。
 *
 *   dsh-learn                       # skills + 命令 -> 用户级；DSH 插件 -> profile
 *   dsh-learn --project             # skills/命令装到当前项目 .agents/（插件仍装到 DSH）
 *   dsh-learn --skills-only         # 只装 skills + 命令（纯 ZCode 用户推荐）
 *   dsh-learn --bundle-only         # 只装 DSH 插件
 *   dsh-learn --no-commands         # 不装斜杠命令
 *   dsh-learn --profile <name>      # 指定 DSH profile（缺省自动选择）
 *   dsh-learn --source <路径或spec> # 手动指定 DSH 插件来源
 *   dsh-learn remove                # 卸载全部
 *
 * ZCode 用户：skills -> ~/.agents/skills/，命令 -> ~/.agents/commands/（两端都扫描）。
 * DSH 用户：额外获得 /learn /learn-next /learn-review 斜杠命令（bundle 注册）。
 * 远端一条命令（推到 GitHub 后）：npx github:atman233/dsh-learn-plugin
 */
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const pkgDir = resolve(scriptDir, "..");
const pkg = JSON.parse(readFileSync(join(pkgDir, "package.json"), "utf8"));
const BUNDLE_NAME = pkg.name;
const COMMANDS = ["learn", "learn-next", "learn-review"];

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
const noCommands = has("--no-commands");
const sourceOverride = opt("--source");
const profileOpt = opt("--profile");

const q = (s) => (/[\\s"]/.test(s) ? `"${s.replace(/"/g, '\\"')}"` : s);
const run = (cmd, opts = {}) => spawnSync(cmd, { shell: true, stdio: "inherit", ...opts });

// ---------- 插件来源解析 ----------
function resolveSource() {
	if (sourceOverride) return { spec: sourceOverride, label: sourceOverride };
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
	return spawnSync("node", args, { cwd: pkgDir, shell: true, stdio: "inherit" }).status === 0;
}

// ---------- 斜杠命令（ZCode/DSH 通用 markdown 命令） ----------
function commandsRoot() {
	return project ? join(process.cwd(), ".agents", "commands") : join(homedir(), ".agents", "commands");
}

function doCommands(remove) {
	if (noCommands && !remove) return true;
	const root = commandsRoot();
	console.log(`\n== ${remove ? "卸载" : "安装/更新"} 斜杠命令 -> ${root} ==`);
	for (const name of COMMANDS) {
		const target = join(root, `${name}.md`);
		if (remove) {
			rmSync(target, { force: true });
		} else {
			mkdirSync(root, { recursive: true });
			cpSync(join(pkgDir, "commands", `${name}.md`), target);
		}
		console.log(`${remove ? "已移除" : "已安装"} /${name}`);
	}
	return true;
}

// ---------- DSH bundle ----------
function ensureDeps() {
	const marker = join(pkgDir, "node_modules", "@deepseek-ai", "dsh-llm");
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
	console.log(`\n== ${remove ? "卸载" : update ? "更新" : "安装"} DSH 插件 -> profile「${profile}」 ==`);
	if (remove) {
		return run(`dsh plugin --profile ${q(profile)} remove ${BUNDLE_NAME}`).status === 0;
	}
	if (local && !ensureDeps()) return false;
	if (update) {
		run(`dsh plugin --profile ${q(profile)} remove ${BUNDLE_NAME}`);
	}
	let ok = run(`dsh plugin --profile ${q(profile)} add ${q(spec)}`).status === 0;
	if (!ok && !local) {
		console.warn(`\n[!] 从 ${label} 安装失败，回退为本地目录 ${pkgDir}`);
		ok = ensureDeps() && run(`dsh plugin --profile ${q(profile)} add ${q(pkgDir)}`).status === 0;
	}
	return ok;
}

// ---------- 主流程 ----------
console.log(`dsh-learn v${pkg.version} — ${command}`);
let ok = true;
if (!bundleOnly) {
	ok = doSkills(command === "remove") && ok;
	if (!noCommands) ok = doCommands(command === "remove") && ok;
}
if (!skillsOnly) ok = doBundle(command === "remove", command === "update") && ok;

if (ok && command !== "remove") {
	console.log(`\n全部完成 ✔`);
	console.log("  ZCode：/learn <主题> 开始，「继续学习」或 /learn-next 生成课程，「复习」或 /learn-review 测验");
	if (!skillsOnly) console.log("  DSH：/learn /learn-next /learn-review（需已安装 bundle）");
} else if (ok) {
	console.log(`\n已卸载 ✔`);
} else {
	console.log("\n有步骤失败，请检查上方输出。");
	process.exit(1);
}
