import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import {
  useAction, useQuery, getWorkroom, reorderWorkroomAgents, runTask, startAgentInProject, startAllAgents, stopAgentInProject,
  stopPlaceRuns, stopTask, stopTaskSession,
} from 'wasp/client/operations'
import { ChevronRight, Play, Square } from 'lucide-react'
import { Button, EmptyState, Scorecards, UnansweredSitesNotice, FOCUS_RING } from '@agenthix/ui/primitives'
import { useMayWork, VIEWER_CANNOT_WORK } from '../../shared/hooks/useMayWork'
import { usePhoneActions, type PhoneAction } from '../../shared/layouts/phoneActions'
import { unansweredSitesCopy } from '../../shared/siteSilence'
import { AgentCards, type CardEntry } from './AgentCards'
import type { CardControls } from './AgentCard'
import { StartAgentDialog, StartAllDialog } from './StartDialogs'
import { StopEveryRunDialog } from './StopEveryRunDialog'
import { useWorkroomActs, useWorkroomClock } from './useWorkroomLive'
import type { WorkroomAgent, WorkroomNeed, WorkroomNow, WorkroomProject } from './workroomTypes'
import { countCards, quietLine, startTitle, stopTitle, type CountCard } from './workroomWords'
import { ReadFailure } from '@agenthix/ui/attention'

const LINK = `inline-flex items-center rounded text-small text-link hover:underline ${FOCUS_RING}`
const ADMINS_ONLY = "Only this project's admins can stop every run in it"

type Dialog = { kind: 'start'; agent: WorkroomAgent } | { kind: 'startAll' } | { kind: 'stopAll' } | null

/**
 * A project's Workroom (spec D17–D19, RU1–RU4, the Workroom design): its agents at work as scorecards, the counts
 * about running above them, and the two ways to start or stop work for the whole project. *Start all agents…* is the
 * page's one filled button; both it and *Stop every run…* ask first. On a phone the two are in the top bar's ⋯ and the
 * cards are one agent per screen.
 */
export function WorkroomTool({ projectId, projectKey, projectName, isProjectAdmin }: {
  projectId: string
  projectKey: string
  projectName: string
  isProjectAdmin: boolean
}) {
  const navigate = useNavigate()
  const { now, todayFrom } = useWorkroomClock()
  const { data, error, refetch } = useQuery(getWorkroom, { projectId, todayFrom })
  const room = data as WorkroomProject | undefined
  const { act, busy, dialog: attention } = useWorkroomActs(refetch, now)
  const mayWork = useMayWork(projectId)
  const [dialog, setDialog] = useState<Dialog>(null)
  const [onlyNeeds, setOnlyNeeds] = useState(false)
  const start = useAction(startAgentInProject)
  const startAll = useAction(startAllAgents)
  const stopAgent = useAction(stopAgentInProject)
  const stopAll = useAction(stopPlaceRuns)
  const stopOne = useAction(stopTask)
  const stopReply = useAction(stopTaskSession)
  const runAgain = useAction(runTask)
  const reorder = useAction(reorderWorkroomAgents)

  const base = `/projects/${encodeURIComponent(projectKey)}`
  const viewer = mayWork ? undefined : VIEWER_CANNOT_WORK
  const counts = room?.counts
  const anything = !!counts && counts.running + counts.waiting > 0
  const stopAllWhy = !isProjectAdmin ? ADMINS_ONLY : !anything ? 'Nothing is running' : undefined
  const startAllWhy = viewer ?? (counts && counts.ready === 0 ? 'No task is ready for any agent' : undefined)

  const actions: PhoneAction[] | null = room ? [
    { label: 'Start all agents…', onSelect: () => setDialog({ kind: 'startAll' }), disabledWhy: startAllWhy },
    { label: 'Stop every run…', onSelect: () => setDialog({ kind: 'stopAll' }), disabledWhy: stopAllWhy },
  ] : null
  const onPhone = usePhoneActions(actions)

  if (error) return <ReadFailure what="The Workroom" retry={() => void refetch()} />
  if (!room || !counts) return <p className="px-6 py-6 text-small text-text-muted max-lg:px-3">Reading the Workroom…</p>

  const controlsOf = (a: WorkroomAgent): CardControls => ({
    onStart: () => setDialog({ kind: 'start', agent: a }),
    startWhy: viewer ?? (a.ready === 0 ? `No task is ready for ${a.name}` : undefined),
    startTitle: startTitle(a),
    onStop: () => act(`${a.name} was not stopped`, () => stopAgent({ projectId, agentId: a.agentId })),
    stopWhy: viewer ?? (a.now.length + a.line.length === 0 ? 'Nothing is running' : undefined),
    stopTitle: stopTitle(a),
    onStopRun: (r: WorkroomNow) => act('The run was not stopped', () => (r.taskId ? stopOne({ taskId: r.taskId }) : stopReply({ sessionId: r.sessionId! }))),
    stopRunWhy: viewer,
    onAnswer: (n: WorkroomNeed) => (n.reason === 'failed'
      ? act(`${n.taskKey} was not run again`, () => runAgain({ taskId: n.taskId }))
      : navigate(n.href)),
    answerWhy: viewer,
  })
  const shown = onlyNeeds ? room.agents.filter(a => a.needs.length > 0) : room.agents
  const entries: CardEntry[] = shown.map(a => ({
    key: a.agentId, agent: a, controls: controlsOf(a), quiet: quietLine(a, { nothingYet: room.nothingYet, mine: false }),
  }))
  const openRuns = (state: CountCard) => navigate(`${base}?tool=runs&state=${state}`)
  const cards = countCards(counts).map(c => ({
    ...c,
    onChoose: c.key === 'spent' ? undefined : c.key === 'needs' ? () => setOnlyNeeds(v => !v) : () => openRuns(c.key),
    chosen: c.key === 'needs' && onlyNeeds,
  }))
  const subtitle = room.nothingYet
    ? `Your agents at work in this project, one card each · ${counts.ready} ${counts.ready === 1 ? 'task' : 'tasks'} ready`
    : 'Your agents at work in this project, one card each: what it is doing, what it has in line, what it finished today, and what needs you.'

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="px-6 pb-6 pt-4 max-lg:px-3 max-lg:pb-3 max-lg:pt-0">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1 max-lg:hidden">
            <h2 className="text-h2 font-medium text-text-primary">Workroom</h2>
            <p className="min-h-[1lh] text-small text-text-muted">{subtitle}</p>
          </div>
          <div className={`flex shrink-0 items-center gap-2 ${onPhone ? 'max-lg:hidden' : ''}`}>
            <Button variant="secondary" leadingIcon={<Square size={14} aria-hidden className="fill-current" />} disabled={!!stopAllWhy} title={stopAllWhy} onClick={() => setDialog({ kind: 'stopAll' })}>
              Stop every run…
            </Button>
            <Button leadingIcon={<Play size={14} aria-hidden className="fill-current" />} disabled={!!startAllWhy} title={startAllWhy} onClick={() => setDialog({ kind: 'startAll' })}>
              Start all agents…
            </Button>
          </div>
        </div>

        <Scorecards label="Runs today" items={cards} className="pt-4 max-lg:pt-3" />
        <UnansweredSitesNotice copy={unansweredSitesCopy(room.unanswered, "today's runs")} className="mt-3" />
        <div className="mt-4 border-t border-border-subtle" />

        {room.nothingYet && (
          <div className="pt-4">
            <EmptyState
              variant="inline"
              title="Nothing has run in this project yet. Put tasks in a To do column with an agent, then ▶ Start that agent here, or run one task from its page (Run). Replies in conversations show here too."
            />
          </div>
        )}
        <div className="flex flex-wrap items-baseline gap-x-2 pb-2 pt-4">
          <h3 className="text-h3 font-medium text-text-primary">Agents at work</h3>
          <span className="text-small text-text-muted max-lg:hidden">In line follows the project’s rank.</span>
          <Link to={`${base}?tool=boards`} className={`${LINK} max-lg:hidden`}>Change the order on a board<ChevronRight size={14} aria-hidden /></Link>
        </div>
        {room.agents.length === 0 ? (
          <EmptyState variant="inline" title="No agent works in this project yet. Add one from the project's Members, then start it here." />
        ) : shown.length === 0 ? (
          <EmptyState variant="inline" title="Nothing needs you here." action={<Button variant="secondary" onClick={() => setOnlyNeeds(false)}>Show every agent</Button>} />
        ) : (
          <AgentCards
            entries={entries} now={now}
            onReorder={mayWork && !onlyNeeds ? ids => act('The order was not changed', () => reorder({ projectId, agentIds: ids })) : undefined}
          />
        )}
        <p className="pt-2 text-small text-text-muted">
          Every run, finished or not, is on <Link to={`${base}?tool=runs`} className={LINK}>Runs<ChevronRight size={14} aria-hidden /></Link>, the project’s history.
        </p>
      </div>

      {dialog?.kind === 'start' && (
        <StartAgentDialog
          projectId={projectId} agent={dialog.agent} busy={busy} onCancel={() => setDialog(null)}
          onStart={ids => act(`${dialog.agent.name} was not started`, () => start({ projectId, agentId: dialog.agent.agentId, taskIds: ids }), () => setDialog(null))}
        />
      )}
      {dialog?.kind === 'startAll' && (
        <StartAllDialog
          projectId={projectId} projectName={projectName} busy={busy} onCancel={() => setDialog(null)}
          onStart={ids => act('The agents were not started', () => startAll({ projectId, taskIds: ids }), () => setDialog(null))}
        />
      )}
      {dialog?.kind === 'stopAll' && (
        <StopEveryRunDialog
          where={projectName} agents={room.agents} busy={busy} onCancel={() => setDialog(null)}
          onStop={() => act('Not every run was stopped', () => stopAll({ projectId }), () => setDialog(null))}
        />
      )}
      {attention}
    </div>
  )
}
