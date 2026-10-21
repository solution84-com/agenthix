import type { ReactNode } from 'react'

export type NoticeTone = 'neutral' | 'healthy' | 'warning' | 'danger'

const TONE: Record<NoticeTone, string> = {
  neutral: 'border-border bg-card',
  healthy: 'border-success/30 bg-success/6',
  warning: 'border-warning/35 bg-warning/7',
  danger: 'border-danger/35 bg-danger/7',
}

/** Something a person should know on this page, said in a sentence; the tone only repeats it. */
export function Notice({ tone = 'neutral', title, children, action }: {
  tone?: NoticeTone
  title?: ReactNode
  children: ReactNode
  action?: ReactNode
}) {
  return (
    <div role={tone === 'danger' ? 'alert' : 'status'} className={`mb-2.5 rounded-xl border px-4 py-3 text-small text-text-primary ${TONE[tone]}`}>
      {title && <p className="mb-0.5 font-semibold">{title}</p>}
      <div>{children}</div>
      {action && <div className="mt-2.5">{action}</div>}
    </div>
  )
}
