import { AppSettings, JDRecord, Material, StorageSnapshot } from '@/types'
import { appStateRepository, getStorageUsage, interviewDraftRepository, LocalStorageRepository, LocalStorageValueRepository, platformConfigRepository, resumeDraftRepository } from './repository'

export const MATERIALS_KEY = 'aidesk:materials'
export const SETTINGS_KEY = 'aidesk:settings'
export const JDS_KEY = 'aidesk:jds'
export const RESUME_DRAFTS_KEY = 'aidesk:resume-drafts'
export const INTERVIEW_DRAFTS_KEY = 'aidesk:interview-drafts'
export const materialsRepository = new LocalStorageRepository<Material>(MATERIALS_KEY)
export const jdsRepository = new LocalStorageRepository<JDRecord>(JDS_KEY)
export const DEFAULT_SETTINGS: AppSettings = { apiKey: '', baseUrl: 'https://api.openai.com/v1', model: 'Qwen/Qwen2.5-7B-Instruct', modelSource: 'recommended', customModel: { name: '', modelId: '', baseUrl: '', apiKey: '' }, theme: 'light', customTags: [] }
export const settingsRepository = new LocalStorageValueRepository<AppSettings>(SETTINGS_KEY, DEFAULT_SETTINGS)

export { getStorageUsage }

export async function getSnapshot(): Promise<StorageSnapshot> {
  const [materials, jds, resumeDrafts, interviewDrafts, settings] = await Promise.all([
    materialsRepository.getAll(), jdsRepository.getAll(), resumeDraftRepository.getDrafts(), interviewDraftRepository.getDrafts(), settingsRepository.get(),
  ])
  return { materials, jds, resumeDrafts, interviewDrafts, settings }
}

export async function clearAllData() { await Promise.all([materialsRepository.clear(), jdsRepository.clear(), resumeDraftRepository.clear(), interviewDraftRepository.clear(), settingsRepository.clear(), platformConfigRepository.clear(), appStateRepository.clear()]) }
