# dsh-learn-plugin

基于 DeepSeek Harness（DSH，dsh-v0.1.2-rc.1）的一整套学习插件：**一句话生成学习规划，每天生成一篇 Amanda Askell 寓言式的图文学习资料。**

```
"我想学 Transformer 的注意力机制"        ← 你只需要一句话
        │
        ▼
learn-plan：摸底 → 知识点大纲 → 每日日程 → plan.md + progress.json
        │
        ▼  之后每天说一句"继续学习"
learn-lesson：day-NN.md 图文课程
        ├─ 寓言导入（不点名故事 → 先问你"在讲什么道理" → 揭晓 → 逐要素回扣）
        ├─ 正式讲解（定义 / 边界 / 常见误区）
        ├─ 图解（archify 生成 SVG + 交互 HTML）
        └─ 主动回忆自测（5 题，答案在文末）
        │
        ▼  随时说"复习"
learn-review：渐进式测验（回忆→应用→挑错→反向费曼）→ 薄弱点写回进度
```

方法论：Anthropic 研究员 Amanda Askell 的寓言提示法——定义是压缩，故事是解压缩；
理解的标准不是复述定义，而是能把定义还原回故事。完整方法论见
`skills/learn-plan/references/method.md`。

> **宿主依赖契约（不遮蔽 DSH 共享宿主包）**：插件包**不携带任何 `@deepseek-ai/*` 副本**。
> - 不 import `@deepseek-ai/cordis`：cordis 内核必须与 DSH 运行时同一实例，
>   cordis 原生支持的对象插件形态 `{ inject, apply }` 天然满足；
> - `@deepseek-ai/dsh-llm` 仅声明为 **optional peerDependency**（版本对齐当前
>   DSH 版本，只用其中的纯工厂 `createUserMessage`），运行时懒加载：
>   常规解析失败时自动回退到 DSH CLI 全局安装自带的宿主副本。
> - DSH 升级后请同步 bump peer 版本约束并重跑一条命令安装。

## 组成

| 部分 | 内容 | 生效范围 |
|------|------|----------|
| `skills/` | learn-plan / learn-lesson / learn-review 三个 skill | DSH 与 ZCode（都扫描 `~/.agents/skills` 与项目 `.agents/skills`） |
| `package.json` + `cordis.patch.yml` + `src/index.mjs` | DSH bundle，注册 `/learn` `/learn-next` `/learn-review` 三条斜杠命令 | 仅 DSH |

## 安装（一条命令，skills + 插件全装好）

### 方式一：推到 GitHub 后（推荐）

先把本仓库推到 GitHub（见下文"发布到 GitHub"）。之后任何一台机器上一条命令即可：

```bash
npx github:atman233/dsh-learn-plugin
```

以后想更新到最新版，重跑同一条命令即可（会拉取仓库最新代码并重装）。

### 方式二：本地克隆后

```bash
cd dsh-learn-plugin
npm run setup        # 等价于 node scripts/cli.mjs
```

### 常用变体

| 命令 | 作用 |
|------|------|
| `dsh-learn` / `npm run setup` | 安装或更新：skills → `~/.agents/skills/`，插件 → DSH profile |
| `dsh-learn --skills-only` | 只装 skills（ZCode、无 DSH 环境） |
| `dsh-learn --project` | skills 装到当前项目 `.agents/skills/` 而非用户级 |
| `dsh-learn --profile <名称>` | 指定 DSH profile（缺省自动选 `desktop`，多个 profile 时提示） |
| `dsh-learn --source <路径或spec>` | 手动指定插件来源（本地开发时用本地路径调试） |
| `dsh-learn remove` / `npm run remove` | 卸载 skills + 插件 |

技能安装后同时被 DSH 与 ZCode 发现；DSH 插件（斜杠命令）只在 DSH 生效，
未检测到 `dsh` 命令时自动跳过、不影响 skills 安装。

### 卸载

```bash
npx github:atman233/dsh-learn-plugin remove    # 或本地 npm run remove
```

## 发布到 GitHub

```bash
cd dsh-learn-plugin
git push -u origin main
```

推送后 `npx github:atman233/dsh-learn-plugin` 即全局可用——CLI 会自动读取
`package.json` 的 `repository` 字段，通过 `dsh plugin --profile <name> add
github:atman233/dsh-learn-plugin` 安装 DSH 插件，并从仓库刷新三个 skill。

### 无法直连 github.com 的机器（重要）

`dsh plugin add github:...` 会用两条通道访问 GitHub，都需要能通：
pnpm 自身的 HTTP（读 `.npmrc` 代理）和 git CLI 的 `ls-remote`（读 git 代理配置）。
在这类机器上做一次性配置：

```bash
# 1) profile 级 .npmrc（$DSH_HOME/profiles/<profile名>/.npmrc）
proxy=http://127.0.0.1:7897
https-proxy=http://127.0.0.1:7897

# 2) git 仅针对 github.com 的代理（不影响其他 git 用途）
git config --global http.https://github.com/.proxy http://127.0.0.1:7897
```

缺第 2 条时会出现"插件更新失败且无法回滚"的现象：pnpm 已经装了新代码，
但 lockfile 解析（走 git）失败，状态不一致。遇到时可 `pnpm update dsh-learn-plugin`
在配置好代理后重跑一次即可对齐。

## 日常使用

| 你说 | 发生什么 |
|------|----------|
| "我想学 X" 或 `/learn X` | 先被摸底 2-3 个问题（基础/目标/每日时长），然后生成完整规划 |
| "继续学习" 或 `/learn-next` | 生成下一个未完成天的图文课程；寓言环节会停下来先问你"这个故事在讲什么道理" |
| "复习" 或 `/learn-review` | 一题一题测验，严苛批改，薄弱点写回进度文件 |
| "我学到哪了" | 读 progress.json 汇报进度 |

学习资料默认生成在 `~/learn/<主题>/`：

```
~/learn/transformer-attention/
├── plan.md        # 总规划（大纲 + 每日日程 + 寓言与图索引）
├── progress.json  # 进度与薄弱点（learn-review 会写回）
├── day-01.md ...  # 每日图文课程
└── diagrams/      # archify 图源 JSON + SVG + 交互 HTML
```

## 配图能力

learn-lesson 依赖本机的 archify skill（`~/.agents/skills/archify`）
生成五种图：架构 / 流程 / 时序 / 数据流 / 状态机。每个图交付两种形态：

- `diagrams/xxx.svg` —— 内联在 day-NN.md 里直接看；
- `diagrams/xxx.html` —— 浏览器打开，暗/亮主题切换，可导出 PNG/SVG。

archify 缺失时按其设计系统手写 SVG 降级；不适合配图的知识点不会硬配图。

## 设计原则（为什么是这个形态）

1. **宁少勿多**：每天内容量以"自测 10 分钟内做完"为上限，防止 D1 塞爆劝退。
2. **延迟命名**：寓言在读者自己推断出道理之前绝不揭晓概念名——标签是思考的终点。
3. **交互优先**：寓言的"先问后揭示"在会话里是真的停下来等你回答，不是装饰。
4. **进度即状态**：所有薄弱点写回 `progress.json`，后续课程主动加固它们。
