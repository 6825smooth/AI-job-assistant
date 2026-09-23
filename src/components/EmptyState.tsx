import { ArrowRight, LucideIcon } from 'lucide-react'

export function EmptyState({ icon: Icon, title, description, actionLabel, onAction }: { icon: LucideIcon; title: string; description: string; actionLabel?: string; onAction?: () => void }) {
  return <div className="flex min-h-56 flex-col items-center justify-center text-center"><Icon size={28} className="text-slate-300" /><h3 className="mt-4 text-sm font-semibold text-slate-700 dark:text-slate-200">{title}</h3><p className="mt-2 max-w-md text-xs leading-5 text-slate-400">{description}</p>{actionLabel && onAction && <button type="button" className="button-primary mt-4 py-2" onClick={onAction}>{actionLabel}<ArrowRight size={15} /></button>}</div>
}
