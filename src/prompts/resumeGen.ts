import { interpolate } from './index'

const COMMON_RULES = `
你是求职助手的资料整理员，不是创作者。
1. 只能使用用户提供的素材和 JD 原文，不得编造、推测或补充任何经历、项目、公司、职责、技术栈、数据和结果。
2. 只能使用本次用户勾选的素材，未勾选的素材不得引用。
3. 素材不足时必须输出 [素材不足：请补充XXX] 或 [待量化]，绝不使用常见模板内容冒充用户经历。
4. 每个经历或项目段落末尾标注引用，如 [ref:materialId]；没有足够素材支撑的段落必须标注缺口。
5. 保留素材中的事实和数字，不得夸大、改写为素材没有支持的结论。
6. 输出中文 Markdown 正文，不要输出解释、分析过程或代码块外壳。
`

export const JD_RESUME_PROMPT = `${COMMON_RULES}
任务：根据目标 JD 和用户勾选的素材，生成一份有针对性的 Markdown 简历。
要求：突出 JD 关键词，但只能从勾选素材中选择真实证据；无法覆盖的要求放入“待补充能力”部分。
简历建议结构：个人概述、核心技能、项目/工作经历、教育经历（仅在素材提供时输出）、待补充能力。

目标 JD：
{{jdText}}

用户勾选的素材：
{{materials}}
`

export const MATERIAL_REORGANIZE_PROMPT = `${COMMON_RULES}
任务：只根据用户勾选的素材重组一份事实准确的 Markdown 简历，不针对任何特定 JD 编造内容。
要求：按素材中的事实整理个人概述、核心技能、项目/工作经历和待补充信息；素材没有提供的内容不要填写。

用户勾选的素材：
{{materials}}
`

export function buildJDResumePrompt(jdText: string, materials: string) {
  return interpolate(JD_RESUME_PROMPT, { jdText, materials })
}

export function buildMaterialReorganizePrompt(materials: string) {
  return interpolate(MATERIAL_REORGANIZE_PROMPT, { materials })
}
