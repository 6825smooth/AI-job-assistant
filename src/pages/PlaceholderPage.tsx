import { ArrowLeft, Construction } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'

const titles: Record<string, string> = { '/jd': 'JD 智能解析', '/resume': '简历生成', '/interview': '面试准备' }
export function PlaceholderPage() { const location = useLocation(); return <div className="flex min-h-[60vh] items-center justify-center"><div className="text-center"><span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-indigo-50 text-indigo-500 dark:bg-indigo-950/60"><Construction size={25} /></span><h1 className="mt-5 text-2xl font-semibold">{titles[location.pathname] ?? '功能建设中'}</h1><p className="mt-2 text-sm text-slate-500 dark:text-slate-400">该模块将在后续开发轮次中实现。</p><Link to="/" className="button-secondary mt-6"><ArrowLeft size={16} />返回首页</Link></div></div> }
