#!/usr/bin/env node
/**
 * 从 archify 渲染出的 HTML 中提取 SVG 与主题 CSS，生成可内嵌 Markdown 的
 * 双主题独立 SVG：dark 变量为默认，prefers-color-scheme: light 时切换。
 * 用法：node scripts/html2svg.mjs <input.html> <output.svg>
 */
import { readFileSync, writeFileSync } from "node:fs";

const [, , inPath, outPath] = process.argv;
const html = readFileSync(inPath, "utf8");

const styleMatch = html.match(/<style>([\s\S]*?)<\/style>/);
const svgMatch = html.match(/<svg[\s\S]*?<\/svg>/);
if (!styleMatch || !svgMatch) {
	console.error("未能从 HTML 中找到 <style> 或 <svg>");
	process.exit(1);
}

let css = styleMatch[1];

// 拆出 dark / light 两个变量块，重写为 :root 默认 + 浅色媒体查询
const varBlock = /(^|\n)\s*(\[data-theme="(dark|light)"\][^)]*?)\{\n([\s\S]*?)\n\s*\}/g;
let darkVars = "";
let lightVars = "";
css = css.replace(/(\[data-theme="(dark|light)"\][^{]*?)\{([\s\S]*?)\n\s*\}/g, (m, sel, theme, body) => {
	if (theme === "dark") darkVars += body;
	else lightVars += body;
	return "";
});
const themeCss = `:root {${darkVars}}\n@media (prefers-color-scheme: light) { :root {${lightVars}} }`;

// 丢掉页面级规则（html/body/toolbar/菜单等），只保留 svg 相关与 :root/.t-* 类
css = css
	.split("\n")
	.filter((line) => !/^\s*(html|body|\.[a-z-]*toolbar|\.menu|\.footer|::)/i.test(line))
	.join("\n");

const svg = svgMatch[0].replace(/^<svg/, '<svg xmlns="http://www.w3.org/2000/svg"');
const out = `<svg xmlns="http://www.w3.org/2000/svg">
  <style>
${themeCss}
${css}
  </style>
${svg.replace(/^<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "")}
</svg>`;

writeFileSync(outPath, out, "utf8");
console.log(`已生成 ${outPath}`);
