import { useCallback, useRef, useState } from 'react'

export function useAIRequest<TArgs extends unknown[], TResult>(request: (...args: TArgs) => Promise<TResult>) {
  const active = useRef(false)
  const [loading, setLoading] = useState(false)

  const run = useCallback(async (...args: TArgs) => {
    if (active.current) return undefined
    active.current = true
    setLoading(true)
    try { return await request(...args) } finally { active.current = false; setLoading(false) }
  }, [request])

  return { run, loading }
}
