import { useEffect, useState } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { BookOpen, ChevronLeft, ChevronRight, FileSearch, FileText, Home, Menu, Moon, Settings, Sparkles, Sun, Users } from 'lucide-react'
import { getStorageUsage, materialsRepository, settingsRepository } from '@/storage'
import { ThemeMode } from '@/types'
import { Toast } from '@/components/Toast'

const navItems = [{ label: '首页', path: '/', icon: Home }, { label: '素材库', path: '/materials', icon: BookOpen }, { label: 'JD 解析', path: '/jd', icon: FileSearch }, { label: '简历生成', path: '/resume', icon: FileText }, { label: '面试准备', path: '/interview', icon: Users }, { label: '设置', path: '/settings', icon: Settings }]

export function Layout({ children, theme, onThemeChange }: { children: React.ReactNode; theme: ThemeMode; onThemeChange: (theme: ThemeMode) => void }) {
  const [collapsed, setCollapsed] = useState(false)
  const [usage, setUsage] = useState({ bytes: 0, formatted: '0 B' })
  const [materialCount, setMaterialCount] = useState(0)
  const [aiToast, setAiToast] = useState('')
  const location = useLocation()
  useEffect(() => { void Promise.all([getStorageUsage(), materialsRepository.getAll(), navigator.storage?.estimate?.()]).then(([nextUsage, materials, estimate]) => { setUsage(nextUsage); setMaterialCount(materials.length); const quota = estimate?.quota ?? 0; if (quota > 0 && estimate?.usage && estimate.usage / quota >= 0.8 && !sessionStorage.getItem('aidesk:capacity-warning')) { sessionStorage.setItem('aidesk:capacity-warning', '1'); setAiToast('本地存储容量即将上限，建议清理冗余内容') } }).catch((error) => { console.error('[Storage] read failed', error); setAiToast('本地数据读取失败，请刷新页面重试') }) }, [location.pathname])
  useEffect(() => { const handleToast = (event: Event) => setAiToast((event as CustomEvent<string>).detail); window.addEventListener('aidesk:ai-toast', handleToast); return () => window.removeEventListener('aidesk:ai-toast', handleToast) }, [])
  const cycleTheme = async () => { try { const next = theme === 'light' ? 'dark' : theme === 'dark' ? 'system' : 'light'; const settings = await settingsRepository.get(); await settingsRepository.save({ ...settings, theme: next }); onThemeChange(next) } catch (error) { console.error('[Storage] theme update failed', error); setAiToast('设置保存失败，请稍后重试') } }
  return <div className="flex min-h-screen bg-slate-50 dark:bg-slate-950">
    <aside className={`${collapsed ? 'w-20' : 'w-64'} fixed inset-y-0 left-0 z-20 flex flex-col border-r bg-white px-3 py-5 transition-all dark:border-slate-800 dark:bg-slate-900`}>
      <div className="flex items-center justify-between px-2"><Link to="/" className="flex items-center gap-3 overflow-hidden"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-indigo-600 text-white"><Sparkles size={20} /></span>{!collapsed && <span className="whitespace-nowrap text-base font-semibold">AI 求职助手</span>}</Link><button className="hidden rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 md:block dark:hover:bg-slate-800" onClick={() => setCollapsed(!collapsed)}>{collapsed ? <ChevronRight size={17} /> : <ChevronLeft size={17} />}</button></div>
      <nav className="mt-8 space-y-1">{navItems.map(({ label, path, icon: Icon }) => <NavLink key={path} to={path} className={({ isActive }) => `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${isActive ? 'bg-indigo-50 text-indigo-700 dark:bg-[#22D3EE]/10 dark:text-[#22D3EE]' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white'}`}><Icon size={18} className="shrink-0" />{!collapsed && label}</NavLink>)}</nav>
      <div className="mt-auto">{!collapsed && <div className="mb-4 rounded-xl bg-slate-50 p-3 dark:bg-slate-950"><div className="flex justify-between text-xs text-slate-500"><span>素材库用量</span><span>{usage.formatted} 已使用</span></div><p className="mt-2 text-xs text-slate-400">{materialCount} 条素材</p></div>}<button onClick={() => void cycleTheme()} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800">{theme === 'dark' ? <Moon size={18} /> : <Sun size={18} />}{!collapsed && (theme === 'system' ? '跟随系统' : theme === 'dark' ? '深色模式' : '浅色模式')}</button></div>
    </aside>
    <main className={`${collapsed ? 'md:pl-20' : 'md:pl-64'} w-full min-w-0 transition-all`}><div className="mx-auto max-w-7xl px-5 py-6 md:px-8 md:py-10">{children}<p className="mt-10 text-center text-xs text-slate-500 dark:text-slate-400">所有数据均存储在浏览器本地，不上传任何服务器，保障个人信息安全</p></div></main>
    <button className="fixed left-4 top-4 z-30 rounded-lg bg-white p-2 shadow md:hidden dark:bg-slate-800" onClick={() => setCollapsed(!collapsed)}><Menu size={18} /></button>
    {aiToast && <Toast message={aiToast} onClose={() => setAiToast('')} />}
  </div>
}
