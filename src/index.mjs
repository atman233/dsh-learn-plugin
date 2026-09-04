/**
 * dsh-learn-plugin —— DSH cordis 插件（对象形态）
 *
 * 注册三条斜杠命令，把请求转交给对应的 skill（learn-plan / learn-lesson /
 * learn-review）执行。命令本身不做业务逻辑：handler 通过 agent.steer 提交
 * 一条模型可见的用户消息，由模型按 skill 流程完成规划 / 课程 / 复习。
 *
 * 刻意不 import @deepseek-ai/cordis（用 cordis 原生支持的对象插件形态
 * { inject, apply }），避免插件自带的 cordis 副本与 DSH 运行时内核的
 * symbol 不一致问题；@deepseek-ai/dsh-llm 只用到纯工厂 createUserMessage。
 */
import { createUserMessage } from "@deepseek-ai/dsh-llm";

/** steer 一条用户消息给 agent，并返回命令成功结果。 */
function submit(agent, text, ack) {
	agent.steer(createUserMessage({
		content: [{ type: "text", text }],
		source: { kind: "user" },
	}));
	return { kind: "success", text: ack };
}

const DshLearn = {
	inject: ["commands"],
	apply(ctx) {
		ctx.commands.register({
			name: "learn",
			description: "为一个新的学习主题制定学习规划（摸底 → 大纲 → 每日日程）",
			input: { hint: "<主题，例如：Transformer 的注意力机制>" },
			handler: ({ agent, rawInput }) => {
				const topic = rawInput.trim();
				const text = topic
					? `我想学习：${topic}。请使用 learn-plan skill 为我制定学习规划：先向我摸底（已有基础、学习目标、每日可投入时长），再产出 plan.md 与 progress.json。`
					: "请使用 learn-plan skill：先向我询问想学习的主题、已有基础、学习目标与每日可投入时长，然后为我制定学习规划（plan.md + progress.json）。";
				return submit(agent, text, topic
					? `正在为「${topic}」制定学习规划…`
					: "正在启动学习规划…");
			},
		});

		ctx.commands.register({
			name: "learn-next",
			description: "按学习规划生成下一个未完成天的图文课程（寓言导入 + 图解 + 自测）",
			input: { hint: "[天数，缺省为下一个未完成日]" },
			handler: ({ agent, rawInput }) => {
				const day = rawInput.trim();
				const text = day
					? `请使用 learn-lesson skill，读取学习规划（当前目录或 ~/learn 下的 plan.md 与 progress.json），为我生成第 ${day} 天的图文课程 day-NN.md。如果有寓言互动环节，请停下来先问我。`
					: "请使用 learn-lesson skill，读取学习规划（当前目录或 ~/learn 下的 plan.md 与 progress.json），为我生成下一个未完成天的图文课程 day-NN.md。如果有寓言互动环节，请停下来先问我。";
				return submit(agent, text, day
					? `正在生成 D${day} 的课程…`
					: "正在生成下一天的课程…");
			},
		});

		ctx.commands.register({
			name: "learn-review",
			description: "对已学内容做渐进式复习测验（回忆→应用→挑错→反向费曼）并写回薄弱点",
			input: { hint: "[]" },
			handler: ({ agent }) => submit(
				agent,
				"请使用 learn-review skill 对我进行复习测验：一次只出一题，等我校完再出下一题，最后把成绩与薄弱点写回 progress.json。",
				"正在开始复习测验…",
			),
		});
	},
};

export { DshLearn, DshLearn as default };
