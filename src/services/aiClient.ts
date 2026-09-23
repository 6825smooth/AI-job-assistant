import { getCurrentAIConfig } from '@/storage/repository'

export type AIClientErrorCode = 'MISSING_KEY' | 'AUTHENTICATION' | 'MODEL_NOT_FOUND' | 'NETWORK' | 'TIMEOUT' | 'RESPONSE_PARSE' | 'API_ERROR'

export class AIClientError extends Error {
  constructor(message: string, public readonly code: AIClientErrorCode, public readonly status?: number, public readonly providerCode?: number) {
    super(message)
    this.name = 'AIClientError'
  }
}

export interface ChatMessage { role: 'system' | 'user' | 'assistant'; content: string }
export interface ChatCompletionOptions { messages: ChatMessage[]; stream?: boolean; signal?: AbortSignal; timeoutMs?: number; onToken?: (token: string) => void }
export interface JsonRequestOptions { prompt: string; signal?: AbortSignal; timeoutMs?: number; onToken?: (token: string) => void }

const DEBOUNCE_MS = 300
const RETRY_DELAY_MS = 1500
const inFlightRequests = new Map<string, Promise<string>>()

function friendlyError(message: string, code: AIClientErrorCode, status?: number, providerCode?: number) {
  if (providerCode === 1302) return new AIClientError('请求过于频繁，请稍后再试', 'API_ERROR', status, providerCode)
  if (providerCode === 1305) return new AIClientError('当前访问人数较多，请稍后重试', 'API_ERROR', status, providerCode)
  if (status === 401 || status === 403) return new AIClientError('API Key 验证失败，请前往设置页检查', 'AUTHENTICATION', status, providerCode)
  if (status === 402 || /额度|余额不足|quota|insufficient balance/i.test(message)) return new AIClientError('账号额度不足，请充值或更换模型', 'API_ERROR', status, providerCode)
  if (code === 'MODEL_NOT_FOUND') return new AIClientError('当前模型不可用，请切换其他模型', code, status, providerCode)
  if (code === 'TIMEOUT' || code === 'NETWORK') return new AIClientError('网络连接异常，请检查网络后重试', code, status, providerCode)
  if (code === 'MISSING_KEY') return new AIClientError('请先在设置页配置 API Key。', code, status, providerCode)
  return new AIClientError('请求失败，请稍后重试', code, status, providerCode)
}

function parseProviderCode(body: string) {
  const match = body.match(/(?:"?code"?|错误码)\s*[:：]\s*"?(1302|1305)\b/i) ?? body.match(/\b(1302|1305)\b/)
  return match ? Number(match[1]) : undefined
}

function parseApiError(status: number, body: string) {
  const providerCode = parseProviderCode(body)
  const modelMissing = /模型不存在|模型不可用|model[^\n]*(not found|does not exist|unavailable)/i.test(body) || (status === 404 && /model/i.test(body))
  const code: AIClientErrorCode = modelMissing ? 'MODEL_NOT_FOUND' : 'API_ERROR'
  return friendlyError(body, code, status, providerCode)
}

async function readStream(response: Response, onToken?: (token: string) => void) {
  if (!response.body) throw friendlyError('', 'RESPONSE_PARSE')
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let result = ''
  const consume = (line: string) => {
    if (!line.startsWith('data:')) return
    const payload = line.slice(5).trim()
    if (!payload || payload === '[DONE]') return
    try {
      const token = JSON.parse(payload).choices?.[0]?.delta?.content ?? ''
      if (token) { result += token; onToken?.(token) }
    } catch {
      throw friendlyError('', 'RESPONSE_PARSE')
    }
  }
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    lines.forEach(consume)
  }
  if (buffer.trim()) consume(buffer.trim())
  if (!result.trim()) throw friendlyError('', 'RESPONSE_PARSE')
  return result
}

function isRetryable(error: AIClientError, attempt: number) {
  if (attempt > 0 || error.providerCode === 1302 || error.code === 'AUTHENTICATION' || error.code === 'MISSING_KEY' || error.code === 'RESPONSE_PARSE') return false
  return error.code === 'TIMEOUT' || error.code === 'NETWORK' || error.providerCode === 1305 || error.code === 'MODEL_NOT_FOUND'
}

function wait(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(resolve, ms)
    signal?.addEventListener('abort', () => { window.clearTimeout(timer); reject(new DOMException('Aborted', 'AbortError')) }, { once: true })
  })
}

function notifyToast(message: string) {
  window.dispatchEvent(new CustomEvent('aidesk:ai-toast', { detail: message }))
}

async function executeRequest(config: Awaited<ReturnType<typeof getCurrentAIConfig>>, messages: ChatMessage[], stream: boolean, timeoutMs: number, signal: AbortSignal | undefined, onToken: ((token: string) => void) | undefined, model: string, allowFallback: boolean): Promise<string> {
  const apiKey = config.apiKey
  if (config.requiresApiKey && !apiKey.trim()) throw friendlyError('', 'MISSING_KEY')
  if (!model.trim() || !config.baseUrl.trim()) throw friendlyError('', 'API_ERROR')
  const endpoint = config.platformId === 'siliconflow' && import.meta.env.DEV ? '/api/chat/completions' : `${config.baseUrl.replace(/\/+$/, '')}/chat/completions`
  let lastError: AIClientError | undefined
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const controller = new AbortController()
    const timer = window.setTimeout(() => controller.abort(), timeoutMs)
    const abort = () => controller.abort()
    signal?.addEventListener('abort', abort, { once: true })
    try {
      const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` }, body: JSON.stringify({ model, messages, stream }), signal: controller.signal })
      if (!response.ok) throw parseApiError(response.status, await response.text())
      if (stream) return await readStream(response, onToken)
      const payload = await response.json()
      const content = payload.choices?.[0]?.message?.content
      if (typeof content !== 'string' || !content.trim()) throw friendlyError('', 'RESPONSE_PARSE')
      return content
    } catch (error) {
      const normalized = error instanceof DOMException && error.name === 'AbortError' ? friendlyError('', 'TIMEOUT') : error instanceof AIClientError ? error : friendlyError('', 'NETWORK')
      console.error('[AI] request failed', { error, model, attempt })
      lastError = normalized
      if (isRetryable(normalized, attempt)) { await wait(RETRY_DELAY_MS, signal); continue }
      break
    } finally {
      window.clearTimeout(timer)
      signal?.removeEventListener('abort', abort)
    }
  }
  const fallbackEligible = lastError && (lastError.code === 'TIMEOUT' || lastError.code === 'NETWORK' || lastError.code === 'MODEL_NOT_FOUND' || lastError.providerCode === 1305)
  if (lastError && fallbackEligible && allowFallback && config.platformId === 'zhipu' && ['glm-4.7-flash', 'glm-4.6v-flash'].includes(model)) {
    try {
      const fallback = await executeRequest(config, messages, stream, timeoutMs, signal, onToken, 'glm-4-flash-250414', false)
      notifyToast('当前模型访问繁忙，已自动切换至稳定版')
      return fallback
    } catch (fallbackError) {
      console.error('[AI] fallback request failed', { error: fallbackError, model: 'glm-4-flash-250414' })
      throw fallbackError
    }
  }
  throw lastError ?? friendlyError('', 'API_ERROR')
}

export async function chatCompletion({ messages, stream = false, signal, timeoutMs = 45000, onToken }: ChatCompletionOptions) {
  const config = await getCurrentAIConfig()
  const key = JSON.stringify({ platformId: config.platformId, modelId: config.modelId, baseUrl: config.baseUrl, messages, stream })
  const existing = inFlightRequests.get(key)
  if (existing) return existing
  const request = (async () => {
    await wait(DEBOUNCE_MS, signal)
    return executeRequest(config, messages, stream, timeoutMs, signal, onToken, config.modelId, true)
  })()
  inFlightRequests.set(key, request)
  try { return await request } finally { inFlightRequests.delete(key) }
}

export async function requestJson<T>({ prompt, signal, timeoutMs, onToken }: JsonRequestOptions): Promise<T> {
  const content = await chatCompletion({ messages: [{ role: 'user', content: prompt }], stream: Boolean(onToken), signal, timeoutMs, onToken })
  const cleaned = content.trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/, '')
  try { return JSON.parse(cleaned) as T } catch { throw friendlyError('', 'RESPONSE_PARSE') }
}
