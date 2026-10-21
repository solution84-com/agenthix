import { useCallback, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { useQuery, useAction, getRunDetail, stopTaskSession, approveManifest, rejectManifest } from 'wasp/client/operations'
import { useSocketListener } from 'wasp/client/webSocket'
import { Button, UnansweredSitesNotice } from '@agenthix/ui/primitives'
import { unreachableSiteCopy } from '../../shared/siteSilence'
import { useMayWorkWhere } from '../../shared/hooks/useMayWork'
import type { RunDetail, RunRequestDetail } from '../screenTypes'
import { clockText, timesText, usageText } from './runFormat'
import { ToolCalls } from './ToolCalls'

const STATUS_WORD: Record<RunDetail['group'], string> = { waiting: 'Waiting for you', running: 'Running', queued: 'Queued', finished: 'Finished' }

/** What a run asked for and how that was answered, in a sentence. */
export function requestText(request: RunRequestDetail): string {
  const asked = [...request.tools, ...request.bashPatterns.map(p => `the command ${p}`)]
  const what = asked.length > 0 ? asked.join(', ') : request.summary ?? 'permission'
  const by = request.decidedBy ? ` by ${request.decidedBy}` : ''
  const when = `${by}${request.answeredAt ? ` at ${clockText(request.answeredAt)}` : ''}`
  switch (request.status) {
    case 'PENDING_APPROVAL': return request.current ? `Asked for ${what} — waiting for you` : `Asked for ${what} — replaced by something newer`
    case 'APPROVED': return `Asked for ${what} — approved${when}, for the next run`
    case 'REJECTED': return `Asked for ${what} — denied${when}`
    default: return `Asked for ${what} — replaced by something newer`
  }
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex gap-4 py-1.5 text-small">
      <dt className="w-32 shrink-0 text-text-muted">{label}</dt>
      <dd className="min-w-0 flex-1 break-words text-text-primary">{children}</dd>
    </div>
  )
}

/** One run opened beside the list: what it was for, who and what it ran as, how it ended, and its tool calls. */
export function RunPane({ runId, sessionId }: { runId: string; sessionId: string | null }) {
  if (!sessionId) return <NotAvailable />
  return <OpenRun runId={runId} sessionId={sessionId} />
}

function NotAvailable() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-1 px-6 py-16 text-center">
      <p className="text-body font-medium text-text-secondary">This run isn't available</p>
      <p className="text-small text-text-muted">It may have been removed, or it may not be yours to see.</p>
    </div>
  )
}

function OpenRun({ runId, sessionId }: { runId: string; sessionId: string }) {
  const { data, isLoading, error, refetch } = useQuery(getRunDetail, { runId, sessionId })
  useSocketListener('agentRunStatus', useCallback(() => { refetch() }, [refetch]))

  if (isLoading) return <p className="px-4 py-8 text-small text-text-muted">Loading…</p>
  const siteCopy = unreachableSiteCopy(error, 'this run')
  if (siteCopy) return <div className="p-4"><UnansweredSitesNotice copy={siteCopy} /></div>
  if (error) return <p role="alert" className="px-4 py-8 text-small text-danger">Could not load this run.</p>
  const run = data as RunDetail | null | undefined
  if (!run) return <NotAvailable />
  return <RunView run={run} onChanged={() => { void refetch() }} />
}

function RunView({ run, onChanged }: { run: RunDetail; onChanged: () => void }) {
  const stop = useAction(stopTaskSession)
  const approve = useAction(approveManifest)
  const reject = useAction(rejectManifest)
  const mayWork = useMayWorkWhere('key')
  const mayAct = run.kind === 'conversation' || mayWork(run.place.projectKey)
  const [busy, setBusy] = useState(false)
  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true)
    try { await fn() } finally { setBusy(false); onChanged() }
  }
  const live = run.status === 'PENDING' || run.status === 'RUNNING'
  const answerable = run.request?.status === 'PENDING_APPROVAL' && run.request.current && mayAct
  const usage = usageText(run.usage, run.model)

  return (
    <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
      <header className="space-y-1 border-b border-border-subtle px-4 py-4">
        <div className="flex items-start justify-between gap-3">
          <h1 className="min-w-0 text-h3 font-semibold text-text-primary">
            {run.ref && <span className="mr-1.5 text-text-muted">{run.ref}</span>}{run.title}
          </h1>
          <div className="flex shrink-0 flex-wrap justify-end gap-2">
            <Link to={run.href} className="rounded-lg border border-border bg-surface-2 px-2.5 py-1 text-micro font-medium text-text-primary hover:bg-surface-hover">
              {run.kind === 'task' ? 'Open the task' : 'Open the conversation'}
            </Link>
            {live && mayAct && (
              <Button size="sm" variant="danger" disabled={busy} onClick={() => act(() => stop({ sessionId: run.sessionId }))}>Stop</Button>
            )}
            {answerable && (
              <>
                <Button size="sm" disabled={busy} onClick={() => act(() => approve({ runId: run.runId, sessionId: run.sessionId }))}>Approve</Button>
                <Button size="sm" variant="secondary" disabled={busy} onClick={() => act(() => reject({ runId: run.runId, sessionId: run.sessionId, reason: 'Denied from the Runs screen' }))}>Deny</Button>
              </>
            )}
          </div>
        </div>
        <p className="text-small text-text-secondary">
          <span className={run.group === 'waiting' ? 'text-warning' : undefined}>{run.outcome ? capitalise(run.outcome) : STATUS_WORD[run.group]}</span>
          {' · '}{timesText(run.startedAt, run.endedAt, run.createdAt)}
        </p>
      </header>

      <dl className="border-b border-border-subtle px-4 py-3">
        <Fact label="Agent">{[run.agent?.name ?? 'No agent', run.place.name, run.kind === 'conversation' && run.place.projectKey ? 'conversation' : null].filter(Boolean).join(' · ')}</Fact>
        {run.startedByLine && <Fact label="Started">{run.startedByLine}</Fact>}
        {run.site && <Fact label="Site">{run.site}</Fact>}
        {run.request && <Fact label="Approval">{requestText(run.request)}</Fact>}
        <Fact label="Runtime and model">{[run.runtime, run.model].filter(Boolean).join(' · ')}</Fact>
        {usage && <Fact label="Usage">{usage}</Fact>}
        {run.error && run.status !== 'COMPLETED' && <Fact label="Error"><span className="text-danger">{run.error}</span></Fact>}
      </dl>

      <ToolCalls runId={run.runId} sessionId={run.sessionId} given={run.approvalGiven} />
    </div>
  )
}

const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
