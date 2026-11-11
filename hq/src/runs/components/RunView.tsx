import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { useAction, useQuery, approveManifest, getRunPage, rejectManifest, runTask, stopTask, stopTaskSession } from 'wasp/client/operations'
import { useSocketListener } from 'wasp/client/webSocket'
import { ChevronLeft, ChevronRight, CircleCheck, CircleHelp, CircleStop, CircleX, LoaderCircle, Play, Square } from 'lucide-react'
import { Button, StatePill, type PillTone } from '@agenthix/ui/primitives'
import { RunAvatar } from '@agenthix/ui/tasks'
import { AuthedAgentAvatar } from '../../shared/components/AuthedAgentAvatar'
import { useAttention } from '../../shared/components/AttentionDialog'
import { useMayWorkWhere, VIEWER_CANNOT_WORK } from '../../shared/hooks/useMayWork'
import { usePhoneActions, type PhoneAction } from '../../shared/layouts/phoneActions'
import { refusalText } from '../../shared/refusal'
import { unreachableSiteCopy } from '../../shared/siteSilence'
import type { RunRequestDetail } from '../screenTypes'
import type { RunNeighbour, RunPageView } from '../runPageTypes'
import { clockText } from './runFormat'
import { tookText } from './historyWords'
import { RunFacts } from './RunFacts'
import { ToolCalls } from './ToolCalls'
import { Nudge, useBackgroundRead } from '@agenthix/ui/attention'
import { SiteSilentRead } from './SiteSilentRead'

const LIVE_TICK_MS = 15_000

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

/**
 * The state in words, with its icon and tone: "Running · 1 min", "Failed"; a failure's reason ("the build command
 * failed") is `reason`, its own line under the chip, so a long one wraps rather than running past the edge.
 */
export function stateWords(view: RunPageView): { tone: PillTone; icon: ReactNode; text: string; reason?: string } {
  const took = tookText(view.tookMs)
  const icon = (I: typeof CircleCheck, spin = false) => <I size={12} aria-hidden className={spin ? 'animate-spin motion-reduce:animate-none' : undefined} />
  if (view.group === 'running') return { tone: 'healthy', icon: icon(LoaderCircle, true), text: `Running · ${took}` }
  if (view.group === 'waiting') return { tone: 'neutral', icon: icon(LoaderCircle), text: 'Waiting to start on its site' }
  if (view.ring === 'FAILED') return { tone: 'danger', icon: icon(CircleX), text: 'Failed', reason: view.note?.text ?? undefined }
  if (view.group === 'needs') return { tone: 'warning', icon: icon(CircleHelp), text: `Needs you · ${(view.note?.lead ?? 'asks you something').toLowerCase()}` }
  if (view.detail.status === 'CANCELLED') return { tone: 'neutral', icon: icon(CircleStop), text: view.note?.text ?? 'Stopped' }
  return { tone: 'healthy', icon: icon(CircleCheck), text: 'Finished' }
}

function NotAvailable() {
  return (
    <Nudge place="content" title="This run isn't available">It may have been removed, or it may not be yours to see.</Nudge>
  )
}

/**
 * A run's own view, wherever it opens (the Runs pages, a link to it): its steps, what it runs on, what it cost, and
 * the runs before and after it (RN1, the Runs design). No box to type into a run: the conversation steers.
 */
export function RunView({ runId, sessionId, runHref }: {
  runId: string
  sessionId: string | null
  /** Where another run of the same task opens. */
  runHref: (n: { runId: string; sessionId: string }) => string
}) {
  const query = useQuery(getRunPage, { runId, ...(sessionId ? { sessionId } : {}) })
  const { data, isLoading, error, refetch } = query
  const read = useBackgroundRead(query, { what: 'The run', pollMs: LIVE_TICK_MS })
  useSocketListener('agentRunStatus', useCallback(() => { void refetch() }, [refetch]))
  const view = data as RunPageView | null | undefined
  const live = view?.group === 'running' || view?.group === 'waiting'
  useEffect(() => {
    if (!live) return
    const id = setInterval(() => { void refetch() }, LIVE_TICK_MS)
    return () => clearInterval(id)
  }, [live, refetch])

  if (isLoading) return <p className="py-8 text-small text-text-muted">Reading the run…</p>
  if (read.failedWithoutData) {
    const siteCopy = unreachableSiteCopy(error, 'this run')
    return siteCopy ? <SiteSilentRead copy={siteCopy} retry={() => void refetch()} /> : read.nudge
  }
  if (!view) return <NotAvailable />
  return <>{read.nudge}<OpenRun view={view} refetch={refetch} runHref={runHref} /></>
}

function NeighbourButton({ n, side, href }: { n: RunNeighbour | null; side: 'previous' | 'next'; href: (n: RunNeighbour) => string }) {
  const navigate = useNavigate()
  if (!n) return null
  const ended = n.endedAt ? `finished ${clockText(n.endedAt)}` : n.status === 'RUNNING' ? 'running' : clockText(n.at)
  return (
    <Button variant="secondary" className="px-3" onClick={() => navigate(href(n))}
      leadingIcon={side === 'previous' ? <ChevronLeft size={14} aria-hidden /> : undefined}
    >
      Run {n.number} · {ended}{side === 'next' && <ChevronRight size={14} aria-hidden />}
    </Button>
  )
}

function OpenRun({ view, refetch, runHref }: { view: RunPageView; refetch: () => unknown; runHref: (n: { runId: string; sessionId: string }) => string }) {
  const navigate = useNavigate()
  const { detail } = view
  const attention = useAttention()
  const mayWorkIn = useMayWorkWhere('key')
  const stopOne = useAction(stopTask)
  const stopReply = useAction(stopTaskSession)
  const runAgain = useAction(runTask)
  const approve = useAction(approveManifest)
  const reject = useAction(rejectManifest)
  const [busy, setBusy] = useState(false)

  const may = view.kind === 'reply' || mayWorkIn(detail.place.projectKey)
  const why = may ? undefined : VIEWER_CANNOT_WORK
  const live = view.group === 'running' || view.group === 'waiting'
  const answerable = detail.request?.status === 'PENDING_APPROVAL' && detail.request.current
  const act = (title: string, work: () => Promise<unknown>) => {
    setBusy(true)
    work().then(() => refetch(), err => attention.show({ title, text: refusalText(err), retry: () => act(title, work) })).finally(() => setBusy(false))
  }
  const stop = () => act('The run was not stopped', () => (view.taskId ? stopOne({ taskId: view.taskId }) : stopReply({ sessionId: detail.sessionId })))
  const again = () => act('The task was not run again', () => runAgain({ taskId: view.taskId! }))
  const openTarget = () => navigate(detail.href)
  const targetLabel = view.kind === 'task' ? 'Open the task' : 'Open the conversation'

  const actions: PhoneAction[] = [
    ...(live ? [{ label: 'Stop', onSelect: stop, disabledWhy: why }] : []),
    ...(view.mayRunAgain ? [{ label: 'Run again', onSelect: again, disabledWhy: why }] : []),
    { label: targetLabel, onSelect: openTarget },
  ]
  const onPhone = usePhoneActions(actions)
  const state = stateWords(view)
  const title = view.kind === 'task' && view.number ? `${detail.title} · Run ${view.number}` : detail.title
  const startedLine = view.group === 'finished' || view.ring === 'FAILED' ? ` · started by ${view.startedBy}, ${clockText(detail.startedAt ?? detail.createdAt)}` : ''

  return (
    <div className="pb-6">
      <div className="flex items-start gap-3 pt-4 max-lg:pt-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-h2 font-medium text-text-primary">{title}</h2>
          <div className="mt-1 flex min-w-0 items-center gap-1.5 text-small text-text-secondary">
            {detail.agent && (
              <RunAvatar name={detail.agent.name} state={view.ring} size="sm">
                <AuthedAgentAvatar name={detail.agent.name} avatarUrl={detail.agent.avatarUrl} size="sm" />
              </RunAvatar>
            )}
            <span className="truncate">{[detail.agent?.name ?? 'No agent', detail.place.name].join(' · ')}{startedLine}</span>
          </div>
        </div>
        <div className={`flex shrink-0 flex-wrap items-center justify-end gap-2 ${onPhone ? 'max-lg:hidden' : ''}`}>
          <Button variant="secondary" onClick={openTarget}>{targetLabel}</Button>
          {live && <Button variant="secondary" disabled={busy || !may} title={why} onClick={stop} leadingIcon={<Square size={14} aria-hidden className="fill-current" />}>Stop</Button>}
          {view.mayRunAgain && <Button variant="secondary" disabled={busy || !may} title={why} onClick={again} leadingIcon={<Play size={14} aria-hidden className="fill-current" />}>Run again</Button>}
        </div>
      </div>

      <div className="grid gap-6 pt-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 border-b border-border-subtle pb-3">
            <StatePill tone={state.tone}>{state.icon}{state.text}</StatePill>
            {view.group !== 'running' && view.tookMs !== null && <span className="text-small text-text-secondary">after {tookText(view.tookMs)}</span>}
            {state.reason && <p className="min-w-0 basis-full break-words text-small text-text-secondary">{state.reason}</p>}
          </div>
          {detail.request && (
            <div className="flex flex-wrap items-center gap-2 border-b border-border-subtle py-3 text-small text-text-secondary">
              <span className="min-w-0 flex-1">{requestText(detail.request)}</span>
              {answerable && (
                <>
                  <Button variant="secondary" disabled={busy || !may} title={why} onClick={() => act('The request was not approved', () => approve({ runId: detail.runId, sessionId: detail.sessionId }))}>Approve</Button>
                  <Button variant="secondary" disabled={busy || !may} title={why} onClick={() => act('The request was not denied', () => reject({ runId: detail.runId, sessionId: detail.sessionId, reason: 'Denied from the run’s page' }))}>Deny</Button>
                </>
              )}
            </div>
          )}
          <ToolCalls runId={detail.runId} sessionId={detail.sessionId} given={detail.approvalGiven} className="py-3" />
          {live && (
            <p className="text-small text-text-muted">
              Works on its own until it finishes. To change course, stop it, or talk to {detail.agent?.name ?? 'the agent'} in the {view.kind === 'task' ? 'task’s conversation' : 'conversation'}.
            </p>
          )}
        </div>
        <div className="min-w-0">
          <RunFacts view={view} />
          {(view.previous || view.next) && (
            <div className="mt-3 flex justify-between gap-2">
              <NeighbourButton n={view.previous} side="previous" href={runHref} />
              <span />
              <NeighbourButton n={view.next} side="next" href={runHref} />
            </div>
          )}
        </div>
      </div>
      {attention.dialog}
    </div>
  )
}
