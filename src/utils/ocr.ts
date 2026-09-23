import { createWorker } from 'tesseract.js'

const LANGUAGE = 'chi_sim'
const CACHE_PATH = 'aidesk-ocr'

export class OCRError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message)
    this.name = 'OCRError'
  }
}

let workerPromise: ReturnType<typeof createWorker> | null = null
let activeProgressCallback: ((progress: number) => void) | undefined

async function getWorker() {
  if (!workerPromise) {
    workerPromise = createWorker(LANGUAGE, undefined, {
      // Tesseract 会将语言包写入浏览器缓存，后续识别无需重复下载。
      cacheMethod: 'write',
      cachePath: CACHE_PATH,
      logger: (message) => activeProgressCallback?.(Math.max(0, Math.min(100, Math.round(message.progress * 100)))),
    })
  }
  try {
    return await workerPromise
  } catch (error) {
    workerPromise = null
    throw error
  }
}

export async function recognizeImage(file: File, onProgress?: (progress: number) => void): Promise<string> {
  if (!file.type.startsWith('image/')) throw new OCRError('请选择有效的图片文件。')

  onProgress?.(0)
  activeProgressCallback = onProgress
  try {
    const worker = await getWorker()
    const result = await worker.recognize(file)
    const text = result.data.text.trim()
    if (!text) throw new OCRError('图片中未识别到可用文字。')
    onProgress?.(100)
    return text
  } catch (error) {
    if (error instanceof OCRError) throw error
    throw new OCRError('图片文字识别失败，请更换清晰图片后重试。', error)
  } finally {
    activeProgressCallback = undefined
  }
}
