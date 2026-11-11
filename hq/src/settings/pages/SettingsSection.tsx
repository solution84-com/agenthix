import type { ReactNode } from 'react'

const idOf = (title: string) => `settings-${title.toLowerCase().replace(/[^a-z]+/g, '-')}`

/** One section of a settings page: a heading, an optional line saying what it is, and its content. */
export function SettingsSection({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  const id = idOf(title)
  return (
    <section aria-labelledby={id} className="border-t border-border-subtle py-6 first:border-t-0 first:pt-0">
      <h2 id={id} className="text-h3 font-medium text-text-primary">{title}</h2>
      {description && <p className="mt-0.5 text-small text-text-secondary">{description}</p>}
      <div className="mt-4">{children}</div>
    </section>
  )
}

/** A labelled fact on a settings page, with an optional action at its end. */
export function SettingsRow({ label, children, action }: { label: string; children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1 py-1.5">
      <span className="w-40 shrink-0 text-small text-text-muted">{label}</span>
      <span className="min-w-0 flex-1 text-body text-text-primary">{children}</span>
      {action && <span className="shrink-0 text-small">{action}</span>}
    </div>
  )
}
