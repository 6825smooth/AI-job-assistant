export function createId() { return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}` }
export function formatDate(value: string | number) { return new Intl.DateTimeFormat('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value)) }
