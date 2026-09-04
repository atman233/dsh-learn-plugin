#!/usr/bin/env node
/**
 * 安装 skills 到本机，使其可被 DSH 与 ZCode 发现：
 *
 *   node scripts/install-skills.mjs           # 安装到 ~/.agents/skills/（用户级，两端通用）
 *   node scripts/install-skills.mjs --project # 安装到 <cwd>/.agents/skills/（项目级）
 *   node scripts/install-skills.mjs --remove  # 从目标位置移除（配合上面的级别开关）
 */
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const skillsDir = join(repoRoot, "skills");
const names = readdirSync(skillsDir).filter((n) => existsSync(join(skillsDir, n, "SKILL.md")));

if (names.length === 0) {
	console.error("未找到任何 skill（skills/<name>/SKILL.md）");
	process.exit(1);
}

const project = process.argv.includes("--project");
const remove = process.argv.includes("--remove");
const targetRoot = project
	? join(process.cwd(), ".agents", "skills")
	: join(homedir(), ".agents", "skills");

for (const name of names) {
	const target = join(targetRoot, name);
	if (remove) {
		rmSync(target, { recursive: true, force: true });
		console.log(`已移除 ${target}`);
	} else {
		mkdirSync(targetRoot, { recursive: true });
		rmSync(target, { recursive: true, force: true });
		cpSync(join(skillsDir, name), target, { recursive: true });
		console.log(`已安装 ${name} -> ${target}`);
	}
}

if (!remove) {
	console.log(`\n完成。${project ? "项目级" : "用户级"}安装对 DSH 与 ZCode 均生效。`);
	console.log("如需 DSH 斜杠命令（/learn /learn-next /learn-review），另执行：");
	console.log("  dsh plugin --profile <profile名> add " + repoRoot);
}
