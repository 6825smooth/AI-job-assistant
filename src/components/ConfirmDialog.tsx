export function ConfirmDialog({ title, description, onCancel, onConfirm, confirmLabel = '确认操作' }: { title: string; description: string; onCancel: () => void; onConfirm: () => void; confirmLabel?: string }) {
  return <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/40 p-4">
    <div className="panel w-full max-w-md p-6"><h3 className="text-lg font-semibold">{title}</h3><p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{description}</p><div className="mt-6 flex justify-end gap-3"><button className="button-secondary" onClick={onCancel}>取消</button><button className="rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-rose-700" onClick={onConfirm}>{confirmLabel}</button></div></div>
  </div>
}
