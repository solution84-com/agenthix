import { useEffect, useMemo, useState } from 'react'
import { useQuery, getToolCallLog, getToolCallOutput } from 'wasp/client/operations'
import { Copy } from 'lucide-react'
import { FilterTabs } from '@agenthix/ui/primitives'
import { copyText } from '../../shared/copyText'
import type { ToolCallView } from '@agenthix/core'
import { askedFirst, clockText, callSummary, outputPreview, type ApprovalGiven } from './runFormat'

type Show = 'all' | 'risky'
const RISK_LABEL: Record<ToolCallView['riskLevel'], string> = { SAFE: 'Safe', LOW: 'Low', MEDIUM: 'Medium', HIGH: 'High', FLAGGED: 'Flagged' }
const RISK_LOOK: Record<ToolCallView['riskLevel'], string> = {
  SAFE: 'text-text-muted', LOW: 'text-text-muted', MEDIUM: 'text-text-secondary', HIGH: 'font-semibold text-warning', FLAGGED: 'font-semibold text-danger',
}

const isRisky = (c: ToolCallView) => c.riskLevel === 'HIGH' || c.riskLevel === 'FLAGGED'

const inputText = (input: unknown): string => {
  const command = (input as { command?: unknown } | null)?.command
  return typeof command === 'string' ? command : JSON.stringify(input, null, 2)
}

/** A run's tool calls in order, each with its risk label; High and Flagged stand out, and a call opens to its input and output. */
export function ToolCalls({ runId, sessionId, given = null, className = 'px-4 py-4' }: { runId: string; sessionId: string; given?: ApprovalGiven | null; className?: string }) {
  const { data, isLoading, error } = useQuery(getToolCallLog, { runId, sessionId })
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

      {isLoading ? <p className="text-small text-text-muted">Loading…</p>
        : error ? <p role="alert" className="text-small text-danger">Could not load the tool calls.</p>
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
      <button type="button" aria-expanded={open} onClick={onToggle} className="flex w-full cursor-pointer items-baseline gap-3 px-3 py-2 text-left hover:bg-surface-hover">
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

  useEffect(() => {
    let live = true
    if (!call.toolUseId) { setOutput({ state: 'none' }); return }
    getToolCallOutput({ runId, sessionId, toolUseId: call.toolUseId })
      .then((r) => { if (live) setOutput(r && r.recorded ? { state: 'text', text: r.output, truncated: r.truncated } : { state: 'none' }) })
      .catch(() => { if (live) setOutput({ state: 'failed' }) })
    return () => { live = false }
  }, [call.toolUseId, runId, sessionId])

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
            <button type="button" onClick={() => void copyText(output.text).then(ok => setCopyFailed(!ok))} className="flex cursor-pointer items-center gap-1 normal-case text-text-muted hover:text-text-primary">
              <Copy size={11} aria-hidden /> {copyFailed ? 'Could not copy: select the text' : 'Copy'}
            </button>
          )}
        </h3>
        {output.state === 'loading' && <p className="text-small text-text-muted">Loading…</p>}
        {output.state === 'none' && <p className="text-small text-text-muted">Output not recorded</p>}
        {output.state === 'failed' && <p role="alert" className="text-small text-danger">Could not load the output.</p>}
        {preview && output.state === 'text' && (
          <>
            <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words font-mono text-micro text-text-secondary">{all ? output.text : preview.text}</pre>
            {preview.cut && !all && (
              <button type="button" onClick={() => setAll(true)} className="mt-1 cursor-pointer text-micro text-accent hover:underline">
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
