import { useCallback, useEffect, useState } from 'react'
import { HdIcon } from './hd-icon'

interface Toast { id: number; msg: string; tone?: string }
let nextId = 0
let push: ((msg: string, tone?: string) => void) | null = null

export function hdToast(msg: string, tone?: string) { push?.(msg, tone) }

export function HdToastHost() {
  const [toasts, setToasts] = useState<Toast[]>([])

  const remove = useCallback((id: number) => {
    setToasts((s) => s.filter((t) => t.id !== id))
  }, [])

  useEffect(() => {
    push = (msg, tone) => {
      const id = ++nextId
      setToasts((s) => [...s, { id, msg, tone }])
      setTimeout(() => remove(id), 3200)
    }
    return () => { push = null }
  }, [remove])

  if (!toasts.length) return null
  return (
    <div className="w-toasts">
      {toasts.map((t) => (
        <div key={t.id} className={t.tone ? `w-toast w-toast--${t.tone}` : 'w-toast'}>
          <HdIcon name={t.tone === 'negative' ? 'x' : 'checkCircle'} size={18} stroke={2} />
          <span>{t.msg}</span>
        </div>
      ))}
    </div>
  )
}
