import type { ReactNode } from 'react'
import { SearchField } from '@agenthix/ui/primitives'

export interface PageHeadingProps {
  title: string
  lede?: ReactNode
  /** Pills beside the title: where it runs, its state. */
  badges?: ReactNode
  /** A *How this works* link to the Help topic that explains the page. */
  help?: ReactNode
}

export function PageHeading({ title, lede, badges, help }: PageHeadingProps) {
  return (
    <header className="mb-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="mr-1 text-h1 font-bold tracking-tight text-text-primary">{title}</h1>
        {badges}
        {help}
      </div>
      {lede && <p className="mt-0.5 text-body text-text-secondary">{lede}</p>}
    </header>
  )
}

/** A section's heading inside a page, with an optional quiet aside at its right. */
export function SectionHeading({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="mt-6 mb-2.5 flex items-baseline gap-3">
      <h2 className="flex-1 text-micro font-semibold uppercase tracking-[.06em] text-text-muted">{children}</h2>
      {aside && <span className="text-small font-medium text-text-secondary">{aside}</span>}
    </div>
  )
}

export interface ListTitleRowProps {
  title: string
  lede?: ReactNode
  /** Finding in the list, at the title's right, where it stays in reach of a long list. */
  find?: { label: string; value: string; onChange: (value: string) => void }
  /** Adding to the list: the screen's one primary button. */
  add?: ReactNode
  /** A *How this works* link to the Help topic that explains the list, beside the title. */
  help?: ReactNode
}

export function ListTitleRow({ title, lede, find, add, help }: ListTitleRowProps) {
  return (
    <header className="mb-4 flex flex-wrap items-start gap-2.5">
      <div className="min-w-[260px] flex-1">
        <div className="flex flex-wrap items-baseline gap-x-3">
          <h1 className="text-h1 font-bold tracking-tight text-text-primary">{title}</h1>
          {help}
        </div>
        {lede && <p className="mt-0.5 text-body text-text-secondary">{lede}</p>}
      </div>
      {find && <SearchField label={find.label} value={find.value} onChange={find.onChange} className="w-48" />}
      {add}
    </header>
  )
}
