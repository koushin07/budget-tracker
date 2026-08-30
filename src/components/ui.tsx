import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'

/**
 * Two-tap destructive action: first tap arms the button ("Sure?"), second tap
 * fires. Used instead of window.confirm(), which is blocked in sandboxed
 * frames (e.g. the Claude artifact viewer). Disarms itself after 3 s.
 */
export function ConfirmButton({
  label,
  confirmLabel = 'Sure?',
  onConfirm,
  title,
}: {
  label: ReactNode
  confirmLabel?: ReactNode
  onConfirm: () => void
  title?: string
}) {
  const [armed, setArmed] = useState(false)
  useEffect(() => {
    if (!armed) return
    const t = setTimeout(() => setArmed(false), 3000)
    return () => clearTimeout(t)
  }, [armed])
  return (
    <button
      className={armed ? 'btn ghost danger armed' : 'btn ghost danger'}
      title={title}
      onClick={() => {
        if (armed) {
          setArmed(false)
          onConfirm()
        } else {
          setArmed(true)
        }
      }}
    >
      {armed ? confirmLabel : label}
    </button>
  )
}

/**
 * Invisible marker that scrolls itself into view when mounted or when
 * `trigger` changes. Placed above edit forms so tapping "Edit" far down a
 * list visibly brings the form onto the screen (crucial on phones).
 */
export function ScrollIntoView({ trigger }: { trigger: unknown }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [trigger])
  return <div ref={ref} style={{ scrollMarginTop: 12 }} />
}

/** Non-blocking notice; replaces alert(), which is blocked in sandboxed frames. */
export function toast(message: string) {
  const el = document.createElement('div')
  el.className = 'toast'
  el.textContent = message
  document.body.appendChild(el)
  setTimeout(() => el.classList.add('show'), 10)
  setTimeout(() => {
    el.classList.remove('show')
    setTimeout(() => el.remove(), 300)
  }, 3500)
}

export function Card({ title, action, children, className = '' }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`card ${className}`}>
      {(title || action) && (
        <div className="card-head">
          {title && <h2>{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  )
}

export function Stat({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: 'good' | 'bad' | 'neutral' }) {
  return (
    <div className={`stat ${tone ?? ''}`}>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  )
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="empty">{children}</p>
}

export function Progress({ ratio }: { ratio: number }) {
  const pct = Math.max(0, Math.min(100, ratio * 100))
  return (
    <div className="progress">
      <div className="progress-fill" style={{ width: `${pct}%` }} />
    </div>
  )
}
