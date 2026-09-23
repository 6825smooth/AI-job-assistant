import { AIModel, AIPlatform } from '@/types'

export const BUILTIN_PLATFORMS: AIPlatform[] = [
  {
    id: 'zhipu', name: '智谱', baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    models: [
      { id: 'glm-4.7-flash', name: 'GLM-4.7-Flash', type: 'free', description: '主力文本模型，200K上下文，永久免费' },
      { id: 'glm-4.6v-flash', name: 'GLM-4.6V-Flash', type: 'free', description: '多模态视觉模型，支持截图识别，永久免费' },
      { id: 'glm-4-flash-250414', name: 'GLM-4-Flash-250414', type: 'free', description: '稳定长文本版本，永久免费' },
    ],
    description: '智谱官方 API 平台', guideUrl: 'https://open.bigmodel.cn', guideSteps: ['注册并登录智谱开放平台', '创建 API Key', '选择模型并保存配置'], requiresApiKey: true,
  },
  {
    id: 'deepseek-official', name: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1',
    models: [
      { id: 'deepseek-flash', name: 'DeepSeek-Flash 高速模型', type: 'free', description: 'DeepSeek 官方高速模型' },
      { id: 'deepseek-reasoner', name: 'DeepSeek-R1 推理模型', type: 'paid', description: 'DeepSeek 官方推理模型' },
    ],
    description: 'DeepSeek 官方 API 平台', guideUrl: 'https://platform.deepseek.com', guideSteps: ['注册并登录 DeepSeek 开放平台', '创建 API Key', '选择模型并保存配置'], requiresApiKey: true,
  },
]

// 备用平台模板
const siliconFlowModels: AIModel[] = [
  { id: 'Qwen/Qwen2.5-7B-Instruct', name: 'Qwen2.5 7B Instruct', type: 'free', description: '免费测试模型' },
  { id: 'THUDM/glm-4-9b-chat', name: 'GLM-4-9B-Chat', type: 'free', description: '免费模型' },
  { id: 'deepseek-ai/DeepSeek-V3', name: 'DeepSeek-V3', type: 'paid', description: '新用户通常有免费额度' },
  { id: 'Qwen/Qwen2.5-72B-Instruct', name: 'Qwen2.5 72B Instruct', type: 'paid', description: '高性能付费模型' },
]
const sparkModels: AIModel[] = [
  { id: 'generalv3.5', name: 'Spark Max', type: 'free', description: '星火通用模型' },
  { id: '4.0Ultra', name: 'Spark Ultra', type: 'paid', description: '更强推理与生成能力' },
  { id: 'generalv3', name: 'Spark Pro', type: 'paid', description: '专业模型' },
]
const dashScopeModels: AIModel[] = [
  { id: 'qwen-turbo', name: '通义千问 Turbo', type: 'free', description: '快速通用模型' },
  { id: 'qwen-plus', name: '通义千问 Plus', type: 'paid', description: '均衡效果与速度' },
  { id: 'qwen-max', name: '通义千问 Max', type: 'paid', description: '高性能模型' },
  { id: 'qwen2.5-72b-instruct', name: 'Qwen2.5 72B Instruct', type: 'paid', description: '开源大模型' },
]
const ollamaModels: AIModel[] = [
  { id: 'qwen2.5:7b', name: 'Qwen2.5 7B', type: 'local', description: '本地模型示例，可替换为已安装模型' },
  { id: 'llama3.2', name: 'Llama 3.2', type: 'local', description: '本地模型示例，可替换为已安装模型' },
  { id: 'deepseek-r1:7b', name: 'DeepSeek-R1 7B', type: 'local', description: '本地模型示例，可替换为已安装模型' },
]

const BACKUP_PLATFORM_TEMPLATES: AIPlatform[] = [
  {
    id: 'siliconflow', name: '硅基流动', baseUrl: 'https://api.siliconflow.cn/v1', models: siliconFlowModels,
    description: '国内兼容 OpenAI 协议的平台', guideUrl: 'https://cloud.siliconflow.cn', guideSteps: ['注册并登录硅基流动控制台', '创建 API Key', '选择模型并保存配置'], requiresApiKey: true,
  },
  {
    id: 'spark', name: '讯飞星辰', baseUrl: 'https://spark-api-open.xf-yun.com/v1', models: sparkModels,
    description: '讯飞星火 OpenAI 兼容接口', guideUrl: 'https://console.xfyun.cn', guideSteps: ['登录讯飞开放平台', '开通星火模型服务', '创建 API Key 并填写模型 ID'], requiresApiKey: true,
  },
  {
    id: 'dashscope', name: '阿里云百炼', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', models: dashScopeModels,
    description: '通义千问兼容 OpenAI 协议接口', guideUrl: 'https://bailian.console.aliyun.com', guideSteps: ['登录阿里云百炼控制台', '创建 API Key', '选择通义千问模型'], requiresApiKey: true,
  },
  {
    id: 'ollama', name: '本地 Ollama', baseUrl: 'http://localhost:11434/v1', models: ollamaModels,
    description: '连接本机已安装的 Ollama 模型', guideUrl: 'https://ollama.com', guideSteps: ['安装并启动 Ollama', '执行 ollama pull 下载模型', '填写本地模型 ID'], requiresApiKey: false,
  },
]

export function getPlatformById(platformId: string) {
  return [...BUILTIN_PLATFORMS, ...BACKUP_PLATFORM_TEMPLATES].find((platform) => platform.id === platformId)
}

export function getBuiltInPlatforms() {
  return BUILTIN_PLATFORMS
}

export function getPlatformModel(platformId: string, modelId: string) {
  return getPlatformById(platformId)?.models.find((model) => model.id === modelId)
}
