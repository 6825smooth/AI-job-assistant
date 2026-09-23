import { calculateIndexedDBUsage, ensureMigrated, getAll as getIndexedDBAll, getByKey, put, putMany, remove, clearStore, STORE_NAMES, StoreName } from './db'
import { AIPlatform, AISelectionState, AppSettings, InterviewDraft, ResumeDraft, UserPlatformConfig } from '@/types'
import { getBuiltInPlatforms, getPlatformById } from '@/config/platforms'

const LEGACY_KEYS = { materials: 'aidesk:materials', jds: 'aidesk:jds', resumes: 'aidesk:resume_drafts', interviews: 'aidesk:interview_drafts', settings: 'aidesk:settings' }
const PLATFORM_CONFIGS_KEY = 'aidesk:platform-configs'
const APP_STATE_KEY = 'aidesk:app-state'
const PLATFORM_MIGRATION_MARKER = 'aidesk:platform-config-migrated:v2'
let backendPromise: Promise<boolean> | null = null
let platformMigrationPromise: Promise<void> | null = null

function storageReady() {
  if (!backendPromise) backendPromise = ensureMigrated(LEGACY_KEYS)
  return backendPromise
}

function storeNameForKey(key: string): StoreName {
  if (key === LEGACY_KEYS.materials) return STORE_NAMES.materials
  if (key === LEGACY_KEYS.jds) return STORE_NAMES.jdRecords
  if (key === LEGACY_KEYS.resumes) return STORE_NAMES.resumeDrafts
  if (key === LEGACY_KEYS.interviews) return STORE_NAMES.interviewDrafts
  return STORE_NAMES.settings
}

function readLocal<T>(key: string, fallback: T): T {
  try { return JSON.parse(window.localStorage.getItem(key) ?? '') as T } catch { return fallback }
}

function writeLocal<T>(key: string, value: T) {
  window.localStorage.setItem(key, JSON.stringify(value))
}

export async function getStorageUsage() {
  if (await storageReady()) {
    try { return await calculateIndexedDBUsage() } catch { /* 自动降级到 LocalStorage */ }
  }
  let bytes = 0
  try {
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index)
      if (key?.startsWith('aidesk:')) bytes += new Blob([window.localStorage.getItem(key) ?? '']).size
    }
  } catch { /* 受限环境返回 0，不阻断页面 */ }
  return { bytes, formatted: bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB` }
}

export class LocalStorageRepository<T extends { id: string }> {
  constructor(private readonly key: string) {}

  async getAll(): Promise<T[]> {
    if (await storageReady()) {
      try { return await getIndexedDBAll<T>(storeNameForKey(this.key)) } catch { /* 降级 */ }
    }
    return readLocal<T[]>(this.key, [])
  }

  async getById(id: string) { return (await this.getAll()).find((item) => item.id === id) }

  async save(item: T): Promise<T> {
    if (await storageReady()) {
      try { await put(storeNameForKey(this.key), item); return item } catch { /* 降级 */ }
    }
    const items = (await this.getAll()).filter((current) => current.id !== item.id)
    writeLocal(this.key, [item, ...items])
    return item
  }

  async delete(id: string): Promise<void> {
    if (await storageReady()) {
      try { await remove(storeNameForKey(this.key), id); return } catch { /* 降级 */ }
    }
    writeLocal(this.key, (await this.getAll()).filter((item) => item.id !== id))
  }

  async clear(): Promise<void> {
    if (await storageReady()) {
      try { await clearStore(storeNameForKey(this.key)); return } catch { /* 降级 */ }
    }
    window.localStorage.removeItem(this.key)
  }
}

/** 简历草稿专用 Repository，沿用 aidesk 命名空间并复用通用 CRUD。 */
export class ResumeDraftRepository extends LocalStorageRepository<ResumeDraft> {
  constructor() { super(LEGACY_KEYS.resumes) }
  async getDrafts() { return (await this.getAll()).sort((a, b) => (b.updateTime ?? Date.parse(b.updatedAt)) - (a.updateTime ?? Date.parse(a.updatedAt))) }
  async getDraft(id: string) { return this.getById(id) }
  async saveDraft(draft: ResumeDraft) { return this.save({ ...draft, targetJdId: draft.jdId ?? null, mode: draft.mode === 'jd' ? 'jd-custom' : draft.mode === 'materials' ? 'basic' : draft.mode, createTime: draft.createTime ?? Date.parse(draft.createdAt), updateTime: Date.now() }) }
  async renameDraft(id: string, title: string) { const draft = await this.getDraft(id); if (!draft) return undefined; return this.saveDraft({ ...draft, title, updatedAt: new Date().toISOString() }) }
  async deleteDraft(id: string) { return this.delete(id) }
}

export const resumeDraftRepository = new ResumeDraftRepository()

/** 面试备考草稿专用 Repository，和简历草稿使用独立的 aidesk 存储 key。 */
export class InterviewDraftRepository extends LocalStorageRepository<InterviewDraft> {
  constructor() { super(LEGACY_KEYS.interviews) }
  async getDrafts() { return (await this.getAll()).sort((a, b) => (b.updateTime ?? Date.parse(b.updatedAt)) - (a.updateTime ?? Date.parse(a.updatedAt))) }
  async getDraft(id: string) { return this.getById(id) }
  async saveDraft(draft: InterviewDraft) { return this.save({ ...draft, targetJdId: draft.jdId ?? null, mode: draft.mode ?? 'interview', createTime: draft.createTime ?? Date.parse(draft.createdAt), updateTime: Date.now() }) }
  async renameDraft(id: string, title: string) { const draft = await this.getDraft(id); if (!draft) return undefined; return this.saveDraft({ ...draft, title, updatedAt: new Date().toISOString() }) }
  async deleteDraft(id: string) { return this.delete(id) }
}

export const interviewDraftRepository = new InterviewDraftRepository()

export class LocalStorageValueRepository<T> {
  constructor(private readonly key: string, private readonly fallback: T) {}

  async get(): Promise<T> {
    if (await storageReady()) {
      try {
        const record = await getByKey<{ key: string; value: T }>(STORE_NAMES.settings, 'settings')
        if (record?.value && typeof record.value === 'object' && this.fallback && typeof this.fallback === 'object') return { ...this.fallback, ...record.value }
        if (record) return record.value
      } catch { /* 降级 */ }
    }
    const stored = readLocal<T | null>(this.key, null)
    if (stored && typeof stored === 'object' && this.fallback && typeof this.fallback === 'object') return { ...this.fallback, ...stored }
    return stored ?? this.fallback
  }

  async save(value: T): Promise<T> {
    if (await storageReady()) {
      try { await put(STORE_NAMES.settings, { key: 'settings', value }); return value } catch { /* 降级 */ }
    }
    writeLocal(this.key, value)
    return value
  }

  async clear(): Promise<void> {
    if (await storageReady()) {
      try { await remove(STORE_NAMES.settings, 'settings'); return } catch { /* 降级 */ }
    }
    window.localStorage.removeItem(this.key)
  }
}

function defaultPlatformConfig(platform: AIPlatform): UserPlatformConfig {
  return {
    platformId: platform.id,
    name: platform.name,
    baseUrl: platform.baseUrl,
    apiKey: '',
    modelId: platform.models[0]?.id ?? '',
    models: platform.models,
    requiresApiKey: platform.requiresApiKey,
    isCustom: Boolean(platform.isCustom),
    guideUrl: platform.guideUrl,
    guideSteps: platform.guideSteps,
    updatedAt: new Date().toISOString(),
  }
}

function readLocalPlatformConfigs(): UserPlatformConfig[] {
  return readLocal<UserPlatformConfig[]>(PLATFORM_CONFIGS_KEY, [])
}

function writeLocalPlatformConfigs(configs: UserPlatformConfig[]) {
  writeLocal(PLATFORM_CONFIGS_KEY, configs)
}

function readLocalAppState(): AISelectionState | undefined {
  return readLocal<AISelectionState | undefined>(APP_STATE_KEY, undefined)
}

function writeLocalAppState(state: AISelectionState) {
  writeLocal(APP_STATE_KEY, state)
}

async function migratePlatformConfig(usesIndexedDB: boolean) {
  if (usesIndexedDB) {
    const marker = await getByKey<{ key: string; success?: boolean }>(STORE_NAMES.appState, PLATFORM_MIGRATION_MARKER)
    if (marker?.success) return
  } else if (window.localStorage.getItem(PLATFORM_MIGRATION_MARKER) === 'success') return

  const settingsRecord = usesIndexedDB ? await getByKey<{ key: string; value: AppSettings }>(STORE_NAMES.settings, 'settings') : undefined
  const legacySettings = settingsRecord?.value ?? readLocal<AppSettings | undefined>(LEGACY_KEYS.settings, undefined)
  const zhipu = getPlatformById('zhipu') ?? getBuiltInPlatforms()[0]
  const now = new Date().toISOString()
  const oldCustom = legacySettings?.customModel
  const customValid = Boolean(oldCustom?.modelId && oldCustom.baseUrl)
  const customConfig: UserPlatformConfig | undefined = customValid ? {
    platformId: 'custom-legacy',
    name: oldCustom?.name || '历史自定义平台',
    baseUrl: oldCustom?.baseUrl ?? '',
    apiKey: oldCustom?.apiKey ?? '',
    modelId: oldCustom?.modelId ?? '',
    models: [{ id: oldCustom?.modelId ?? '', name: oldCustom?.name || oldCustom?.modelId || '自定义模型', type: 'paid' }],
    requiresApiKey: true,
    isCustom: true,
    updatedAt: now,
  } : undefined
  const zhipuConfig: UserPlatformConfig = {
    ...defaultPlatformConfig(zhipu),
    apiKey: legacySettings?.apiKey ?? '',
    baseUrl: legacySettings?.baseUrl && legacySettings.baseUrl !== 'https://api.openai.com/v1' ? legacySettings.baseUrl : zhipu.baseUrl,
    modelId: zhipu.models[0]?.id || '',
    updatedAt: now,
  }
  const builtInConfigs = [zhipuConfig, ...getBuiltInPlatforms().filter((platform) => platform.id !== zhipuConfig.platformId).map((platform) => defaultPlatformConfig(platform))]
  const currentPlatformId = legacySettings?.modelSource === 'custom' && customConfig ? customConfig.platformId : zhipuConfig.platformId
  const currentModelId = currentPlatformId === customConfig?.platformId ? customConfig.modelId : zhipuConfig.modelId

  if (usesIndexedDB) {
    const records: Array<{ storeName: StoreName; value: unknown }> = []
    for (const config of builtInConfigs) if (!await getByKey(STORE_NAMES.platformConfigs, config.platformId)) records.push({ storeName: STORE_NAMES.platformConfigs, value: config })
    if (customConfig && !await getByKey(STORE_NAMES.platformConfigs, customConfig.platformId)) records.push({ storeName: STORE_NAMES.platformConfigs, value: customConfig })
    if (!await getByKey(STORE_NAMES.appState, 'current')) records.push({ storeName: STORE_NAMES.appState, value: { key: 'current', platformId: currentPlatformId, modelId: currentModelId, updatedAt: now } satisfies AISelectionState })
    records.push({ storeName: STORE_NAMES.appState, value: { key: PLATFORM_MIGRATION_MARKER, success: true, updatedAt: now } })
    if (records.length) await putMany(records)
  } else {
    const existing = readLocalPlatformConfigs()
    const builtInIds = new Set(builtInConfigs.map((config) => config.platformId))
    const merged = [...existing.filter((config) => !builtInIds.has(config.platformId) && config.platformId !== customConfig?.platformId), ...builtInConfigs]
    if (customConfig) merged.push(customConfig)
    writeLocalPlatformConfigs(merged)
    if (!readLocalAppState()) writeLocalAppState({ key: 'current', platformId: currentPlatformId, modelId: currentModelId, updatedAt: now })
    window.localStorage.setItem(PLATFORM_MIGRATION_MARKER, 'success')
  }
}

async function platformStorageReady() {
  const usesIndexedDB = await storageReady()
  if (!platformMigrationPromise) platformMigrationPromise = migratePlatformConfig(usesIndexedDB)
  await platformMigrationPromise
  return usesIndexedDB
}

export class PlatformConfigRepository {
  async getAll(): Promise<UserPlatformConfig[]> {
    if (await platformStorageReady()) {
      try { return await getIndexedDBAll<UserPlatformConfig>(STORE_NAMES.platformConfigs) } catch { /* 降级 */ }
    }
    return readLocalPlatformConfigs()
  }

  async getByPlatformId(platformId: string): Promise<UserPlatformConfig | undefined> {
    if (await platformStorageReady()) {
      try { return await getByKey<UserPlatformConfig>(STORE_NAMES.platformConfigs, platformId) } catch { /* 降级 */ }
    }
    return (await this.getAll()).find((config) => config.platformId === platformId)
  }

  async save(config: UserPlatformConfig): Promise<UserPlatformConfig> {
    if (await platformStorageReady()) {
      try { await put(STORE_NAMES.platformConfigs, config); return config } catch { /* 降级 */ }
    }
    const configs = (await this.getAll()).filter((item) => item.platformId !== config.platformId)
    writeLocalPlatformConfigs([config, ...configs])
    return config
  }

  async delete(platformId: string): Promise<void> {
    if (await platformStorageReady()) {
      try { await remove(STORE_NAMES.platformConfigs, platformId); return } catch { /* 降级 */ }
    }
    writeLocalPlatformConfigs((await this.getAll()).filter((config) => config.platformId !== platformId))
  }

  async clear(): Promise<void> {
    if (await platformStorageReady()) {
      try { await clearStore(STORE_NAMES.platformConfigs); return } catch { /* 降级 */ }
    }
    window.localStorage.removeItem(PLATFORM_CONFIGS_KEY)
  }
}

export const platformConfigRepository = new PlatformConfigRepository()

export class AppStateRepository {
  async get(): Promise<AISelectionState | undefined> {
    if (await platformStorageReady()) {
      try { return await getByKey<AISelectionState>(STORE_NAMES.appState, 'current') } catch { /* 降级 */ }
    }
    return readLocalAppState()
  }

  async save(state: AISelectionState): Promise<AISelectionState> {
    if (await platformStorageReady()) {
      try { await put(STORE_NAMES.appState, state); return state } catch { /* 降级 */ }
    }
    writeLocalAppState(state)
    return state
  }

  async clear(): Promise<void> {
    if (await platformStorageReady()) {
      try { await clearStore(STORE_NAMES.appState); return } catch { /* 降级 */ }
    }
    window.localStorage.removeItem(APP_STATE_KEY)
  }
}

export const appStateRepository = new AppStateRepository()

export async function getAvailablePlatforms(): Promise<AIPlatform[]> {
  let storedConfigs = await platformConfigRepository.getAll()
  const storedIds = new Set(storedConfigs.map((config) => config.platformId))
  const missingBuiltIns = getBuiltInPlatforms().filter((platform) => !storedIds.has(platform.id)).map((platform) => defaultPlatformConfig(platform))
  if (missingBuiltIns.length) {
    for (const config of missingBuiltIns) await platformConfigRepository.save(config)
    storedConfigs = [...storedConfigs, ...missingBuiltIns]
  }
  const dedupedConfigs = [...storedConfigs].sort((left, right) => Number(right.isCustom) - Number(left.isCustom)).filter((config, index, configs) => configs.findIndex((item) => item.platformId === config.platformId || item.name.trim().toLowerCase() === config.name.trim().toLowerCase()) === index)
  if (dedupedConfigs.length !== storedConfigs.length) {
    await platformConfigRepository.clear()
    for (const config of dedupedConfigs) await platformConfigRepository.save(config)
  }
  const storedPlatformIds = new Set(dedupedConfigs.map((config) => config.platformId))
  const builtInPlatforms = getBuiltInPlatforms().filter((platform) => storedPlatformIds.has(platform.id)).map((platform) => {
    const stored = dedupedConfigs.find((config) => config.platformId === platform.id)
    return stored ? { ...platform, baseUrl: stored.baseUrl, models: stored.models } : platform
  })
  const customConfigs = dedupedConfigs.filter((config) => config.isCustom)
  const customPlatforms: AIPlatform[] = customConfigs.map((config) => ({
    id: config.platformId, name: config.name, baseUrl: config.baseUrl, models: config.models, description: '用户自定义平台',
    guideUrl: config.guideUrl, guideSteps: config.guideSteps ?? [], requiresApiKey: config.requiresApiKey, isCustom: true,
  }))
  return [...builtInPlatforms, ...customPlatforms]
}

export async function getPlatformConfig(platformId: string): Promise<UserPlatformConfig> {
  const stored = await platformConfigRepository.getByPlatformId(platformId)
  if (stored) return stored
  const platform = (await getAvailablePlatforms()).find((item) => item.id === platformId) ?? getPlatformById(platformId)
  if (!platform) throw new Error('未找到对应的 AI 平台配置。')
  return defaultPlatformConfig(platform)
}

export async function getCurrentPlatformSelection(): Promise<AISelectionState> {
  const current = await appStateRepository.get()
  if (current && (await getAvailablePlatforms()).some((platform) => platform.id === current.platformId)) return current
  const config = await getPlatformConfig('zhipu')
  return { key: 'current', platformId: config.platformId, modelId: config.modelId, updatedAt: new Date().toISOString() }
}

export async function setCurrentPlatformSelection(platformId: string, modelId: string): Promise<AISelectionState> {
  const state: AISelectionState = { key: 'current', platformId, modelId, updatedAt: new Date().toISOString() }
  return appStateRepository.save(state)
}

export async function getCurrentAIConfig(): Promise<UserPlatformConfig> {
  const selection = await getCurrentPlatformSelection()
  const config = await getPlatformConfig(selection.platformId)
  return config.modelId === selection.modelId ? config : { ...config, modelId: selection.modelId }
}
