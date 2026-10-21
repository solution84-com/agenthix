import type { ReactNode } from 'react'

/** One group of cards on a site's page ("The site", "The machine"): a tag, what it holds, and the cards. */
export function FactGroup({ tag, name, aside, tinted = false, children }: {
  tag: string
  /** The machine's own name, beside the tag. */
  name?: string
  aside: string
  tinted?: boolean
  children: ReactNode
}) {
  return (
    <section
      aria-label={name ? `${tag} ${name}` : tag}
      className={`mb-4 rounded-2xl border px-4 py-3.5 ${tinted ? 'border-border-strong bg-surface-2' : 'border-border'}`}
    >
      <div className="mb-2.5 flex flex-wrap items-baseline gap-2 text-small text-text-muted">
        <span className="rounded-md bg-chip px-2 py-0.5 text-micro font-semibold uppercase tracking-[.06em] text-text-secondary">{tag}</span>
        {name && <b className="font-semibold text-text-primary">{name}</b>}
        <span>{aside}</span>
      </div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3">{children}</div>
    </section>
  )
}

/** A fact card: a small heading with a pill or a link at its right, then what it says. */
export function FactCard({ title, aside, help, wide = false, children }: { title: string; aside?: ReactNode; help?: ReactNode; wide?: boolean; children: ReactNode }) {
  return (
    <section aria-label={title} className={`flex flex-col gap-1.5 rounded-xl border border-border bg-card px-4 py-3 ${wide ? 'col-span-full' : ''}`}>
      <h3 className="flex flex-wrap items-center gap-x-2 gap-y-1 text-micro font-semibold uppercase tracking-[.06em] text-text-muted">
        <span className="flex-[1_0_auto]">{title}</span>
        {help}
        {aside}
      </h3>
      {children}
    </section>
  )
}

/** A plain statement on a card, in a sentence; a warning is written, the tone only repeats it. */
export function Say({ warn = false, lead, children }: { warn?: boolean; lead?: string; children: ReactNode }) {
  return (
    <p className={`rounded-lg border px-3 py-2 text-small text-text-primary ${warn ? 'border-warning/35 bg-warning/7' : 'border-border bg-surface-2'}`}>
      {lead && <b className="font-semibold">{lead}</b>}{lead && ' '}{children}
    </p>
  )
}
