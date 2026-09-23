export function readEditCache<T>(key: string): T | null {
  try { return JSON.parse(window.localStorage.getItem(key) ?? 'null') as T | null } catch (error) { console.error('[Storage] edit cache read failed', error); return null }
}

export function writeEditCache<T>(key: string, value: T) {
  try { window.localStorage.setItem(key, JSON.stringify(value)) } catch (error) { console.error('[Storage] edit cache write failed', error) }
}

export function clearEditCache(key: string) {
  try { window.localStorage.removeItem(key) } catch (error) { console.error('[Storage] edit cache clear failed', error) }
}
