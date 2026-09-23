export const DB_NAME = 'aiJobAssistantDB'
export const DB_VERSION = 2

export const STORE_NAMES = {
  materials: 'materials',
  jdRecords: 'jdRecords',
  resumeDrafts: 'resumeDrafts',
  interviewDrafts: 'interviewDrafts',
  settings: 'settings',
  platformConfigs: 'platformConfigs',
  appState: 'appState',
} as const

export type StoreName = typeof STORE_NAMES[keyof typeof STORE_NAMES]

let databasePromise: Promise<IDBDatabase> | null = null

export function isIndexedDBSupported() {
  return typeof window !== 'undefined' && 'indexedDB' in window && Boolean(window.indexedDB)
}

export function openDatabase(): Promise<IDBDatabase> {
  if (!isIndexedDBSupported()) return Promise.reject(new Error('当前环境不支持 IndexedDB'))
  if (databasePromise) return databasePromise
  databasePromise = new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const database = request.result
      if (!database.objectStoreNames.contains(STORE_NAMES.materials)) database.createObjectStore(STORE_NAMES.materials, { keyPath: 'id' })
      if (!database.objectStoreNames.contains(STORE_NAMES.jdRecords)) database.createObjectStore(STORE_NAMES.jdRecords, { keyPath: 'id' })
      if (!database.objectStoreNames.contains(STORE_NAMES.resumeDrafts)) database.createObjectStore(STORE_NAMES.resumeDrafts, { keyPath: 'id' })
      if (!database.objectStoreNames.contains(STORE_NAMES.interviewDrafts)) database.createObjectStore(STORE_NAMES.interviewDrafts, { keyPath: 'id' })
      if (!database.objectStoreNames.contains(STORE_NAMES.settings)) database.createObjectStore(STORE_NAMES.settings, { keyPath: 'key' })
      if (!database.objectStoreNames.contains(STORE_NAMES.platformConfigs)) database.createObjectStore(STORE_NAMES.platformConfigs, { keyPath: 'platformId' })
      if (!database.objectStoreNames.contains(STORE_NAMES.appState)) database.createObjectStore(STORE_NAMES.appState, { keyPath: 'key' })
    }
    request.onsuccess = () => {
      request.result.onversionchange = () => request.result.close()
      resolve(request.result)
    }
    request.onerror = () => reject(request.error ?? new Error('IndexedDB 打开失败'))
    request.onblocked = () => reject(new Error('IndexedDB 连接被阻塞'))
  })
  return databasePromise
}

function requestPromise<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('IndexedDB 请求失败'))
  })
}

export async function getAll<T>(storeName: StoreName): Promise<T[]> {
  const database = await openDatabase()
  const transaction = database.transaction(storeName, 'readonly')
  return requestPromise(transaction.objectStore(storeName).getAll() as IDBRequest<T[]>)
}

export async function getByKey<T>(storeName: StoreName, key: IDBValidKey): Promise<T | undefined> {
  const database = await openDatabase()
  const transaction = database.transaction(storeName, 'readonly')
  return requestPromise(transaction.objectStore(storeName).get(key) as IDBRequest<T | undefined>)
}

export async function put<T>(storeName: StoreName, value: T): Promise<void> {
  const database = await openDatabase()
  const transaction = database.transaction(storeName, 'readwrite')
  transaction.objectStore(storeName).put(value)
  await transactionComplete(transaction)
}

export async function remove(storeName: StoreName, key: IDBValidKey): Promise<void> {
  const database = await openDatabase()
  const transaction = database.transaction(storeName, 'readwrite')
  transaction.objectStore(storeName).delete(key)
  await transactionComplete(transaction)
}

export async function clearStore(storeName: StoreName): Promise<void> {
  const database = await openDatabase()
  const transaction = database.transaction(storeName, 'readwrite')
  transaction.objectStore(storeName).clear()
  await transactionComplete(transaction)
}

export async function putMany(records: Array<{ storeName: StoreName; value: unknown }>): Promise<void> {
  const database = await openDatabase()
  const storeNames = [...new Set(records.map((record) => record.storeName))]
  const transaction = database.transaction(storeNames, 'readwrite')
  records.forEach(({ storeName, value }) => transaction.objectStore(storeName).put(value))
  await transactionComplete(transaction)
}

function transactionComplete(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB 事务失败'))
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB 事务已回滚'))
  })
}

function parseLegacy<T>(key: string, fallback: T): T {
  try { return JSON.parse(window.localStorage.getItem(key) ?? '') as T } catch { return fallback }
}

function hasLegacyValue(key: string) {
  return window.localStorage.getItem(key) !== null
}

const MIGRATION_MARKER = 'aidesk:indexeddb-migrated:v1'

export async function ensureMigrated(legacyKeys: { materials: string; jds: string; resumes: string; interviews: string; settings: string }) {
  if (!isIndexedDBSupported()) return false
  try {
    await openDatabase()
    if (window.localStorage.getItem(MIGRATION_MARKER) === 'success') return true

    const materials = parseLegacy<unknown[]>(legacyKeys.materials, [])
    const jds = parseLegacy<unknown[]>(legacyKeys.jds, [])
    const resumes = parseLegacy<unknown[]>(legacyKeys.resumes, [])
    const interviews = parseLegacy<unknown[]>(legacyKeys.interviews, [])
    const hasSettings = hasLegacyValue(legacyKeys.settings)
    const settings = hasSettings ? parseLegacy<Record<string, unknown>>(legacyKeys.settings, {}) : null
    const sourceStores: Array<{ storeName: StoreName; values: unknown[] }> = [
      { storeName: STORE_NAMES.materials, values: materials },
      { storeName: STORE_NAMES.jdRecords, values: jds },
      { storeName: STORE_NAMES.resumeDrafts, values: resumes },
      { storeName: STORE_NAMES.interviewDrafts, values: interviews },
    ]

    // 不因某一个仓库已有数据就跳过全部迁移：逐仓库补齐缺失记录，避免部分迁移造成数据遗漏。
    const records: Array<{ storeName: StoreName; value: unknown }> = []
    for (const { storeName, values } of sourceStores) {
      const existing = await getAll<{ id?: string }>(storeName)
      const existingIds = new Set(existing.map((item) => item.id).filter((id): id is string => Boolean(id)))
      values.forEach((value) => {
        const id = typeof value === 'object' && value !== null && 'id' in value && typeof value.id === 'string' ? value.id : undefined
        if (!id || !existingIds.has(id)) records.push({ storeName, value })
      })
    }
    if (settings && (await getByKey(STORE_NAMES.settings, 'settings')) === undefined) {
      records.push({ storeName: STORE_NAMES.settings, value: { key: 'settings', value: settings } })
    }
    if (records.length > 0) await putMany(records)

    const validation = await Promise.all(sourceStores.map(async ({ storeName, values }) => {
      const imported = await getAll<{ id?: string }>(storeName)
      const ids = new Set(imported.map((item) => item.id).filter((id): id is string => Boolean(id)))
      return values.every((value) => typeof value === 'object' && value !== null && 'id' in value && typeof value.id === 'string' && ids.has(value.id))
    }))
    const settingsValid = !hasSettings || (await getByKey(STORE_NAMES.settings, 'settings')) !== undefined
    if (validation.some((valid) => !valid) || !settingsValid) throw new Error('IndexedDB 迁移数量校验失败')
    window.localStorage.setItem(MIGRATION_MARKER, 'success')
    return true
  } catch { return false }
}

export async function calculateIndexedDBUsage() {
  const [materials, jds, resumes, interviews, settings, platformConfigs, appState] = await Promise.all([
    getAll(STORE_NAMES.materials), getAll(STORE_NAMES.jdRecords), getAll(STORE_NAMES.resumeDrafts), getAll(STORE_NAMES.interviewDrafts), getAll(STORE_NAMES.settings), getAll(STORE_NAMES.platformConfigs), getAll(STORE_NAMES.appState),
  ])
  const bytes = new Blob([JSON.stringify({ materials, jds, resumes, interviews, settings, platformConfigs, appState })]).size
  return { bytes, formatted: bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB` }
}
