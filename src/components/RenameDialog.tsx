import { useState } from 'react'

export function RenameDialog({ title, value, onCancel, onConfirm }: { title: string; value: string; onCancel: () => void; onConfirm: (value: string) => void }) {
  const [name, setName] = useState(value)
  return <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/40 p-4">
    <div className="panel w-full max-w-md p-6"><h3 className="text-lg font-semibold">{title}</h3><input autoFocus className="field mt-4" value={name} onChange={(event) => setName(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && name.trim()) onConfirm(name.trim()) }} /><div className="mt-6 flex justify-end gap-3"><button className="button-secondary" onClick={onCancel}>取消</button><button className="button-primary" disabled={!name.trim()} onClick={() => onConfirm(name.trim())}>确认重命名</button></div></div>
  </div>
}
