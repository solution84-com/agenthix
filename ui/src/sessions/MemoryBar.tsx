import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { contextShare, type ContextSummarisedDetail, type ContextUse } from '@agenthix/core'
import { formatTokens } from '../agents/aiMetrics'
import { formatTime } from './SessionComponents'
import type { TranscriptEntry } from './types'
import { FOCUS_RING } from '../primitives/controlStyles'
import { BUTTON_SECONDARY } from '../primitives/buttonStyles'

const FILL = { room: 'bg-accent', filling: 'bg-warning', nearly_full: 'bg-danger' } as const
const SUMMARISE_HINT = 'Summarise older messages so the agent has more room. Uses a little of your model usage.'

/** The agent's memory as a bar filled to the share used, with a tick where the runtime summarises on its own. */
export function MemoryBar({ use, small = false }: { use: ContextUse; small?: boolean }) {
  const share = contextShare(use)
  return (
    <div
      role="progressbar"
      aria-label="The agent's memory"
      aria-valuenow={share.percent}
      aria-valuemin={0}
      aria-valuemax={100}
      className={`relative w-full overflow-hidden rounded-full bg-surface-3 ${small ? 'h-1' : 'h-1.5'}`}
    >
      <div className={`h-full rounded-full ${FILL[share.level]}`} style={{ width: `${share.percent}%` }} />
      {share.summarisesAtPercent !== null && (
        <span aria-hidden className="absolute inset-y-0 w-px bg-text-secondary" style={{ left: `${share.summarisesAtPercent}%` }} />
      )}
    </div>
  )
}

export function SummariseNowButton({ busy, disabled, onSummarise }: { busy: boolean; disabled: boolean; onSummarise: () => void }) {
  return (
    <button
      type="button"
      onClick={onSummarise}
      disabled={disabled || busy}
      title={disabled ? 'Wait until the agent finishes' : SUMMARISE_HINT}
      className={`shrink-0 rounded-lg px-2.5 py-1 text-small font-medium max-lg:min-h-10 ${BUTTON_SECONDARY}`}
    >
      Summarise now
    </button>
  )
}

/** The popup's memory row: the bar, its figures and Summarise now. */
export function MemoryRow({ use, agentWorking, onSummarise, summarising }: { use: ContextUse | null; agentWorking: boolean; onSummarise?: () => void; summarising: boolean }) {
  if (!use) {
    return <p className="text-small text-text-muted">Not known yet — it is read after the agent's next reply.</p>
  }
  const share = contextShare(use)
  return (
    <div className="space-y-1.5">
      <p className="text-small text-text-primary">{share.percent}% · {formatTokens(use.tokens)} of {formatTokens(use.window)} tokens</p>
      <MemoryBar use={use} />
      <div className="flex items-start justify-between gap-2">
        <p className="text-micro text-text-muted">
          as of the last reply{share.summarisesAtPercent !== null && <> · summarises itself at about {share.summarisesAtPercent}%</>}
        </p>
        {onSummarise && <SummariseNowButton busy={summarising} disabled={agentWorking} onSummarise={onSummarise} />}
      </div>
    </div>
  )
}

/** Where the runtime summarised: a quiet centred line that opens to what the agent remembers now. */
export function SummarisedMarker({ entry }: { entry: TranscriptEntry }) {
  const [open, setOpen] = useState(false)
  const [all, setAll] = useState(false)
  const detail = entry.detail as ContextSummarisedDetail | null
  const who = entry.summarisedByYou ? 'You summarised' : entry.summarisedBy ? `${entry.summarisedBy} summarised` : 'The agent summarised'
  const summary = detail?.summary ?? null
  return (
    <div className="text-center text-micro text-text-muted">
      <button type="button" onClick={() => setOpen(v => !v)} aria-expanded={open} className="inline-flex items-center gap-1 hover:text-text-secondary max-lg:min-h-10">
        <span>{who} everything above{who.startsWith('The agent') ? ' to make room' : ''} · {formatTime(entry.createdAt)}</span>
        {open ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
      </button>
      {open && (
        <div className="mx-auto mt-2 max-w-md space-y-2 rounded-xl border border-border-subtle bg-surface-1 p-3 text-left">
          {summary && (
            <div>
              <p className="text-micro font-medium text-text-secondary">What the agent remembers now</p>
              <p className={`mt-1 whitespace-pre-wrap text-small text-text-primary ${all ? '' : 'line-clamp-3'}`}>{summary}</p>
              <button type="button" onClick={() => setAll(v => !v)} className={`mt-1 text-micro text-link hover:underline ${FOCUS_RING}`}>{all ? 'Show less' : 'Show all'}</button>
            </div>
          )}
          <p>You can still read every message above; the agent works from this summary.</p>
        </div>
      )}
    </div>
  )
}
