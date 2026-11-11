import { useEffect, useMemo, useState } from 'react'
import { useQuery, getToolCallLog, getToolCallOutput } from 'wasp/client/operations'
import { Copy } from 'lucide-react'
import { FilterTabs, FOCUS_RING_INSET, FOCUS_RING } from '@agenthix/ui/primitives'
import { copyText, COPY_FAILED_WORDS } from '../../shared/copyText'
import type { ToolCallView } from '@agenthix/core'
import { askedFirst, clockText, callSummary, outputPreview, type ApprovalGiven } from './runFormat'
import { ReadFailure, ShowAttention, retryRead, toast, useBackgroundRead } from '@agenthix/ui/attention'

type Show = 'all' | 'risky'
const RISK_LABEL: Record<ToolCallView['riskLevel'], string> = { SAFE: 'Safe', LOW: 'Low', MEDIUM: 'Medium', HIGH: 'High', FLAGGED: 'Flagged' }
const RISK_LOOK: Record<ToolCallView['riskLevel'], string> = {
  SAFE: 'text-text-muted', LOW: 'text-text-muted', MEDIUM: 'text-text-secondary', HIGH: 'font-medium text-warning', FLAGGED: 'font-medium text-danger',
}

const isRisky = (c: ToolCallView) => c.riskLevel === 'HIGH' || c.riskLevel === 'FLAGGED'

const inputText = (input: unknown): string => {
  const command = (input as { command?: unknown } | null)?.command
  return typeof command === 'string' ? command : JSON.stringify(input, null, 2)
}

/** A run's tool calls in order, each with its risk label; High and Flagged stand out, and a call opens to its input and output. */
export function ToolCalls({ runId, sessionId, given = null, className = 'px-4 py-4' }: { runId: string; sessionId: string; given?: ApprovalGiven | null; className?: string }) {
  const query = useQuery(getToolCallLog, { runId, sessionId })
  const { data, isLoading } = query
  const read = useBackgroundRead(query, { what: 'The tool calls' })
  const [show, setShow] = useState<Show>('all')
  const [open, setOpen] = useState<string | null>(null)
  const calls = data ?? []
  const shown = useMemo(() => (show === 'risky' ? calls.filter(isRisky) : calls), [calls, show])

  return (
    <section aria-label="Tool calls" className={className}>
      <div className="flex items-center justify-between pb-2">
        <h2 className="text-micro font-medium uppercase tracking-wide text-text-muted">Tool calls{calls.length > 0 ? ` · ${calls.length}` : ''}</h2>
        {calls.length > 0 && (
          <FilterTabs label="Show tool calls" value={show} onChange={setShow} tabs={[{ value: 'all', label: 'All' }, { value: 'risky', label: 'High and Flagged' }]} />
        )}
      </div>
      {read.nudge && !read.failedWithoutData && <div className="pb-2">{read.nudge}</div>}

      {isLoading ? <p className="text-small text-text-muted">Loading…</p>
        : read.failedWithoutData ? read.nudge
          : calls.length === 0 ? <p className="text-small text-text-muted">This run made no tool calls.</p>
            : shown.length === 0 ? <p className="text-small text-text-muted">No High or Flagged calls in this run.</p>
              : (
                <ul className="divide-y divide-border-subtle rounded-lg border border-border-subtle">
                  {shown.map(call => (
                    <ToolCall key={call.id} call={call} given={given} runId={runId} sessionId={sessionId} open={open === call.id} onToggle={() => setOpen(open === call.id ? null : call.id)} />
                  ))}
                </ul>
              )}
    </section>
  )
}

function ToolCall({ call, given, runId, sessionId, open, onToggle }: {
  call: ToolCallView; given: ApprovalGiven | null; runId: string; sessionId: string; open: boolean; onToggle: () => void
}) {
  return (
    <li>
      <button type="button" aria-expanded={open} onClick={onToggle} className={`flex w-full cursor-pointer items-baseline gap-3 px-3 py-2 text-left transition-colors hover:bg-surface-hover active:bg-surface-pressed ${FOCUS_RING_INSET}`}>
        <span className="w-11 shrink-0 text-micro text-text-muted">{clockText(call.createdAt)}</span>
        <span className={`w-14 shrink-0 text-micro ${RISK_LOOK[call.riskLevel]}`}>{RISK_LABEL[call.riskLevel]}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-mono text-small text-text-primary">{callSummary(call.toolName, call.toolInput)}</span>
          {askedFirst(call, given) && (
            <span className="block text-micro text-text-muted">Asked first — approved{given?.by ? ` by ${given.by}` : ''}{given?.at ? ` at ${clockText(given.at)}` : ''}</span>
          )}
          {call.blocked && (
            <span className="block text-micro text-danger">Blocked{call.blockReason ? ` — ${call.blockReason}` : ''}</span>
          )}
        </span>
      </button>
      {open && <CallDetail call={call} runId={runId} sessionId={sessionId} />}
    </li>
  )
}

type Output = { state: 'loading' } | { state: 'none' } | { state: 'failed' } | { state: 'text'; text: string; truncated: boolean }

function CallDetail({ call, runId, sessionId }: { call: ToolCallView; runId: string; sessionId: string }) {
  const [output, setOutput] = useState<Output>({ state: 'loading' })
  const [all, setAll] = useState(false)
  const [copyFailed, setCopyFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let live = true
    const stop = new AbortController()
    if (!call.toolUseId) { setOutput({ state: 'none' }); return }
    retryRead(() => getToolCallOutput({ runId, sessionId, toolUseId: call.toolUseId! }), { signal: stop.signal })
      .then((r) => { if (live) setOutput(r && r.recorded ? { state: 'text', text: r.output, truncated: r.truncated } : { state: 'none' }) })
      .catch(() => { if (live) setOutput({ state: 'failed' }) })
    return () => { live = false; stop.abort() }
  }, [call.toolUseId, runId, sessionId, attempt])

  const preview = output.state === 'text' ? outputPreview(output.text) : null
  return (
    <div className="space-y-3 border-t border-border-subtle bg-surface-0 px-3 py-3">
      <div>
        <h3 className="pb-1 text-micro font-medium uppercase tracking-wide text-text-muted">Input</h3>
        <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words font-mono text-micro text-text-primary">{inputText(call.toolInput)}</pre>
      </div>
      <div>
        <h3 className="flex items-center justify-between pb-1 text-micro font-medium uppercase tracking-wide text-text-muted">
          <span>Output{preview ? ` · ${preview.total.toLocaleString('en-GB')} ${preview.total === 1 ? 'line' : 'lines'}` : ''}</span>
          {output.state === 'text' && (
            <button type="button" onClick={() => void copyText(output.text).then(ok => { if (ok) toast('Output copied'); else setCopyFailed(true) })} className="flex cursor-pointer items-center gap-1 normal-case text-text-muted hover:text-text-primary">
              <Copy size={11} aria-hidden /> Copy
            </button>
          )}
          {output.state === 'text' && (
            <ShowAttention kind="alert" text={copyFailed ? COPY_FAILED_WORDS : null} title="The output was not copied" onClose={() => setCopyFailed(false)} />
          )}
        </h3>
        {output.state === 'loading' && <p className="text-small text-text-muted">Loading…</p>}
        {output.state === 'none' && <p className="text-small text-text-muted">Output not recorded</p>}
        {output.state === 'failed' && <ReadFailure what="The output" retry={() => { setOutput({ state: 'loading' }); setAttempt(a => a + 1) }} />}
        {preview && output.state === 'text' && (
          <>
            <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words font-mono text-micro text-text-secondary">{all ? output.text : preview.text}</pre>
            {preview.cut && !all && (
              <button type="button" onClick={() => setAll(true)} className={`rounded mt-1 cursor-pointer text-micro text-link hover:underline ${FOCUS_RING}`}>
                Show all {preview.total.toLocaleString('en-GB')} lines
              </button>
            )}
            {output.truncated && <p className="mt-1 text-micro text-text-muted">The rest of this output is too long to show.</p>}
          </>
        )}
      </div>
    </div>
  )
}
