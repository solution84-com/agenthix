import type { ReactNode } from 'react'
import { ChevronRight } from 'lucide-react'
import { FOCUS_RING_INSET } from '@agenthix/ui/primitives'
import { runtimeLine } from '../../capabilities/runtimes'
import { providerAnchor } from '../../admin/aiPage'
import type { ProviderCardProvider } from './ProviderCardCore'
import { STATE_SHORT_WORDS, kindsWords } from './providerWords'

export interface ProviderRowProps {
  provider: ProviderCardProvider
  open: boolean
  onToggle: () => void
  /** What the line opens into: the place's `ProviderCardCore`. */
  children: ReactNode
  /** What stays mounted while the line is closed, such as the dialog of a check that was still running. */
  aside?: ReactNode
  /** The line a link or Open its provider opened. */
  current?: boolean
  /** The frame of a line that works, open or not; one that isn't working is always drawn in the danger colour. */
  frame?: string
}

/** "Thinking, Hearing · OpenCode": what a provider lets agents do, then the runtime its models run on. */
export function rowSummary(p: ProviderCardProvider): string {
  const runs = runtimeLine(p)?.runtimes ?? []
  const runtime = runs.length > 1 ? `${runs.slice(0, -1).join(', ')} and ${runs[runs.length - 1]}` : runs[0]
  return [kindsWords(p.types), runtime].filter(Boolean).join(' · ')
}

/**
 * One provider as one line, in setup and on the AI page: its name, kinds, runtime and state. A provider that isn't
 * working (other than Agenthix Cloud not open yet) stands out in the danger colour with its reason. Pressing the line opens it in place; the list it is in keeps
 * one open at a time.
 */
export function ProviderRow({ provider: p, open, onToggle, children, aside, current, frame = 'border-border' }: ProviderRowProps) {
  const works = p.state === 'works'
  // Agenthix Cloud before it opens is a fact, not a fault: its line stays quiet.
  const quiet = works || p.state === 'not_available'
  const panel = `${providerAnchor(p.id)}-details`
  const summary = rowSummary(p)
  return (
    <li id={providerAnchor(p.id)} aria-current={current ? 'true' : undefined}
      className={`scroll-mt-4 rounded-xl border ${quiet ? frame : 'border-danger/50 bg-danger/5'}`}>
      <button type="button" aria-expanded={open} aria-controls={panel} onClick={onToggle}
        className={`flex w-full flex-wrap items-center gap-x-3 gap-y-1 rounded-xl px-3.5 py-2.5 text-left ${FOCUS_RING_INSET}`}>
        <span className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2">
          <span className="text-body font-medium text-text-primary">{p.name}</span>
          {summary && <span className="text-small text-text-secondary">{summary}</span>}
        </span>
        <span className={`inline-flex items-center gap-1.5 text-small ${quiet ? 'text-text-secondary' : 'font-medium text-danger'}`}>
          <span aria-hidden className={`h-2 w-2 shrink-0 rounded-full ${works ? 'bg-success' : quiet ? 'bg-text-muted' : 'bg-danger'}`} />
          {STATE_SHORT_WORDS[p.state]}
        </span>
        <ChevronRight size={16} aria-hidden className={`shrink-0 text-text-muted transition-transform ${open ? 'rotate-90' : ''}`} />
      </button>
      {open && <div id={panel} className="border-t border-border-subtle px-3.5 pb-3">{children}</div>}
      {aside}
    </li>
  )
}
