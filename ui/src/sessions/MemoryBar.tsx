import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { CONTEXT_NEARLY_FULL_PERCENT, contextShare, type ContextSummarisedDetail, type ContextUse } from '@agenthix/core'
import { formatTokens } from '../agents/aiMetrics'
import { formatTime } from './SessionComponents'
import type { TranscriptEntry } from './types'

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
      className="shrink-0 rounded-lg border border-border px-2.5 py-1 text-small font-medium text-text-primary hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-50 max-lg:min-h-10"
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

/** From 90%: a quiet notice above the message box, with the bar small and Summarise now. */
export function MemoryNotice({ use, agentWorking, summarising, onSummarise }: { use: ContextUse | null; agentWorking: boolean; summarising: boolean; onSummarise?: () => void }) {
  if (!use || contextShare(use).percent < CONTEXT_NEARLY_FULL_PERCENT) return null
  const share = contextShare(use)
  return (
    <div role="status" className="mx-3 mb-2 flex items-center gap-3 rounded-lg border border-border-subtle bg-surface-1 px-3 py-2">
      <div className="min-w-0 flex-1 space-y-1">
        <p className="text-small text-text-secondary">The agent's memory of this conversation is nearly full. It will summarise older messages soon.</p>
        <div className="flex items-center gap-2">
          <div className="w-28"><MemoryBar use={use} small /></div>
          <span className="text-micro tabular-nums text-text-muted">{share.percent}%</span>
        </div>
      </div>
      {onSummarise && <SummariseNowButton busy={summarising} disabled={agentWorking} onSummarise={onSummarise} />}
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
              <button type="button" onClick={() => setAll(v => !v)} className="mt-1 text-micro text-accent hover:underline">{all ? 'Show less' : 'Show all'}</button>
            </div>
          )}
          <p>You can still read every message above; the agent works from this summary.</p>
        </div>
      )}
    </div>
  )
}
