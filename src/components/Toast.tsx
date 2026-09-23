import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react'
import { useEffect } from 'react'

export function Toast({ message, onClose, type = 'success', duration = 3000 }: { message: string; onClose: () => void; type?: 'success' | 'error' | 'info'; duration?: number }) {
  useEffect(() => { const timer = window.setTimeout(onClose, duration); return () => window.clearTimeout(timer) }, [duration, onClose])
  const Icon = type === 'error' ? AlertCircle : type === 'info' ? Info : CheckCircle2
  const color = type === 'error' ? 'text-rose-500' : type === 'info' ? 'text-indigo-500' : 'text-emerald-500'
  return <div role="status" className="fixed bottom-6 right-6 z-50 flex max-w-sm items-center gap-3 rounded-xl border bg-white px-4 py-3 text-sm shadow-lg dark:border-slate-700 dark:bg-slate-900">
    <Icon size={18} className={color} /> <span>{message}</span><button aria-label="关闭提示" onClick={onClose}><X size={16} /></button>
  </div>
}
