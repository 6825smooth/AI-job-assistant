import html2canvas from 'html2canvas'

type HtmlDocx = { asBlob: (html: string, options?: { orientation?: 'portrait' | 'landscape'; margins?: Record<string, number> }) => Blob }

let htmlDocxPromise: Promise<HtmlDocx> | null = null
function loadHtmlDocx(): Promise<HtmlDocx> {
  if (window.htmlDocx) return Promise.resolve(window.htmlDocx)
  if (htmlDocxPromise) return htmlDocxPromise
  htmlDocxPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = '/html-docx.js'
    script.onload = () => window.htmlDocx ? resolve(window.htmlDocx) : reject(new Error('Word 导出模块加载失败'))
    script.onerror = () => reject(new Error('Word 导出模块加载失败'))
    document.head.appendChild(script)
  })
  return htmlDocxPromise
}

export function safeFileName(title: string, fallback = '未命名文档') {
  return (title.trim() || fallback).replace(/[\\/:*?"<>|]/g, '-').slice(0, 120)
}

function download(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.click()
  URL.revokeObjectURL(url)
}

export function exportMarkdown(content: string, title: string) {
  download(new Blob([content], { type: 'text/markdown;charset=utf-8' }), `${safeFileName(title)}.md`)
}

export function printPreview(title: string) {
  const previousTitle = document.title
  document.title = safeFileName(title)
  document.body.classList.add('printing-document')
  window.print()
  document.body.classList.remove('printing-document')
  document.title = previousTitle
}

export async function exportWord(preview: HTMLElement, title: string) {
  try {
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{font-family:Arial,"Microsoft YaHei",sans-serif;color:#1e293b;line-height:1.7;padding:24px}h1{font-size:28px}h2{font-size:22px}h3{font-size:18px}p{margin:8px 0}blockquote{border-left:3px solid #94a3b8;padding-left:12px;color:#64748b} </style></head><body>${preview.innerHTML}</body></html>`
    const htmlDocx = await loadHtmlDocx()
    download(htmlDocx.asBlob(html), `${safeFileName(title)}.docx`)
  } catch (error) {
    console.error('Word 导出失败:', error)
    throw error
  }
}

export async function exportPng(preview: HTMLElement, title: string) {
  const canvas = await html2canvas(preview, { scale: 2, backgroundColor: '#ffffff', useCORS: true })
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
  if (!blob) throw new Error('PNG 导出失败')
  download(blob, `${safeFileName(title)}.png`)
}
