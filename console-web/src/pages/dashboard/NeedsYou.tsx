import { Button } from '@agenthix/ui/primitives'
import { navigate } from '../../router'
import type { NeedsYou as Item } from './dashboardWords'

/** What needs you, on top of the dashboard: each thing in a line, with a button to the page that has the fix. */
export function NeedsYou({ items }: { items: Item[] }) {
  if (items.length === 0) return null
  return (
    <section aria-label="Needs you" className="mb-2 flex flex-col gap-2">
      {items.map(item => (
        <article key={item.key} aria-label={item.title} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl border border-warning/45 bg-warning/7 px-4 py-2.5">
          <div className="min-w-[220px] flex-1">
            <h2 className="text-body font-semibold text-text-primary">{item.title}</h2>
            <p className="text-small text-text-secondary">{item.text}</p>
          </div>
          <Button variant="secondary" onClick={() => navigate(item.to)}>{item.action}</Button>
        </article>
      ))}
    </section>
  )
}
