export const PRESET_TAGS = ['项目素材', '简历金句', '面经干货', 'JD收藏', '行业洞察', '公司信息'] as const

export type Tag = string
export type ThemeMode = 'light' | 'dark' | 'system'

export interface Material {
  id: string
  title: string
  content: string
  type?: 'personal' | 'reference'
  sourceUrl?: string
  tags: Tag[]
  note?: string
  createdAt: string
  updatedAt: string
}

export interface JDKeyword {
  word: string
  weight: number
}

export interface ParsedJD {
  hardRequirements: string[]
  softSkills: string[]
  businessDirection: string[]
  inspectionPoints: string[]
  keywords: JDKeyword[]
  metadata?: JDMetadata
}

export interface JDMetadata {
  companyName?: string
  positionName?: string
  city?: string
}

export interface MatchedMaterial {
  material: Material
  score: number
  reason: string
  dimensions: {
    tag: number
    content: number
    relevance: number
  }
}

export interface JDMatchResult {
  totalScore: number
  matchedMaterials: MatchedMaterial[]
  shortageTips: string[]
}

export interface JDRecord {
  id: string
  title: string
  rawText: string
  parsed: ParsedJD
  matchResult: JDMatchResult
  createdAt: string
  updatedAt: string
}

export type ResumeGenerationMode = 'jd' | 'materials'

export interface ResumeDraft {
  id: string
  title: string
  mode: ResumeGenerationMode | 'jd-custom' | 'basic'
  jdId?: string
  materialIds: string[]
  content: string
  createdAt: string
  updatedAt: string
  targetJdId?: string | null
  createTime?: number
  updateTime?: number
}

export interface InterviewDraft {
  id: string
  title: string
  jdId: string
  materialIds: string[]
  content: string
  createdAt: string
  updatedAt: string
  targetJdId?: string | null
  mode?: string
  createTime?: number
  updateTime?: number
}

export type ModelSource = 'recommended' | 'custom'

export interface CustomModelConfig {
  name: string
  modelId: string
  baseUrl: string
  apiKey: string
}

export interface AppSettings {
  apiKey: string
  baseUrl: string
  model: string
  modelSource: ModelSource
  customModel: CustomModelConfig
  theme: ThemeMode
  customTags: string[]
}

export interface StorageSnapshot {
  materials: Material[]
  jds: JDRecord[]
  resumeDrafts: ResumeDraft[]
  interviewDrafts: InterviewDraft[]
  settings: AppSettings
}

export type AIModelType = 'free' | 'paid' | 'local'

export interface AIModel {
  id: string
  name: string
  type: AIModelType
  description?: string
}

export interface AIPlatform {
  id: string
  name: string
  baseUrl: string
  models: AIModel[]
  description: string
  guideUrl?: string
  guideSteps: string[]
  requiresApiKey: boolean
  isCustom?: boolean
}

export interface UserPlatformConfig {
  platformId: string
  name: string
  baseUrl: string
  apiKey: string
  modelId: string
  models: AIModel[]
  requiresApiKey: boolean
  isCustom: boolean
  guideUrl?: string
  guideSteps?: string[]
  updatedAt: string
}

export interface AISelectionState {
  key: 'current'
  platformId: string
  modelId: string
  updatedAt: string
}
