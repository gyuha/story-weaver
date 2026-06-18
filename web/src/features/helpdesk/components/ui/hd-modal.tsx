import { useEffect } from 'react'
import { HdIcon } from './hd-icon'

interface Props {
  open: boolean
  onClose?: () => void
  title: string
  children: React.ReactNode
  footer?: React.ReactNode
  width?: number
}

export function HdModal({ open, onClose, title, children, footer, width = 460 }: Props) {
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose?.() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="w-overlay"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.() }}
    >
      <div className="w-modal" style={{ width }} role="dialog" aria-modal="true">
        <div className="w-modal__head">
          <h3 className="w-title-2" style={{ margin: 0 }}>{title}</h3>
          <button className="w-iconbtn" onClick={onClose} aria-label="닫기">
            <HdIcon name="x" size={20} />
          </button>
        </div>
        <div className="w-modal__body">{children}</div>
        {footer && <div className="w-modal__foot">{footer}</div>}
      </div>
    </div>
  )
}
