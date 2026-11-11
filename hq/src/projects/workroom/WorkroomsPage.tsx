import { Fragment, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { useAction, useQuery, getWorkrooms, reorderWorkroomAgents, runTask, stopMyRuns, stopTask, stopTaskSession } from 'wasp/client/operations'
import { ChevronRight, Square } from 'lucide-react'
import { Button, EmptyState, PlaceAvatar, Scorecards, UnansweredSitesNotice, FOCUS_RING } from '@agenthix/ui/primitives'
import { AppLayout } from '../../shared/layouts/AppLayout'
import { useMayWorkWhere, VIEWER_CANNOT_WORK } from '../../shared/hooks/useMayWork'
import { useIsMobile } from '../../shared/hooks/useIsMobile'
import { unansweredSitesCopy } from '../../shared/siteSilence'
import { AgentCards, type CardEntry } from './AgentCards'
import type { CardControls } from './AgentCard'
import { StopEveryRunDialog } from './StopEveryRunDialog'
import { useWorkroomActs, useWorkroomClock } from './useWorkroomLive'
import type { WorkroomAgent, WorkroomNeed, WorkroomNow, WorkroomProject, WorkroomsView } from './workroomTypes'
import { countCards, quietLine, stopTitle } from './workroomWords'
import { ReadFailure } from '@agenthix/ui/attention'

const LINK = `inline-flex items-center rounded text-small text-link hover:underline ${FOCUS_RING}`
const TITLE = 'Workrooms'
const SUBTITLE = 'Your agents at work in every project and your own space: who is at work where, and what each needs from you.'

const workroomHref = (p: WorkroomProject) => (p.personal ? '/space' : `/projects/${encodeURIComponent(p.projectKey)}?tool=workroom`)

/**
 * Workrooms (spec D19, the Workrooms design): the viewer's agents at work across projects — the same counts and
 * scorecards as a Workroom, for their own runs only, grouped by project in each project's agent order, their own space
 * last. Live only: nothing here creates or starts (Start is greyed, to be done in the project's Workroom), so there is
 * no filled button; Stop and *Stop every run…* stop the viewer's own runs. The history is on Runs.
 */
export function WorkroomsPage() {
  const navigate = useNavigate()
  const phone = useIsMobile()
  const { now, todayFrom } = useWorkroomClock()
  const { data, error, refetch } = useQuery(getWorkrooms, { todayFrom })
  const view = data as WorkroomsView | undefined
  const { act, busy, dialog: attention } = useWorkroomActs(refetch, now)
  const mayWorkIn = useMayWorkWhere()
  const [stopping, setStopping] = useState(false)
  const [onlyNeeds, setOnlyNeeds] = useState(false)
  const stopMine = useAction(stopMyRuns)
  const stopOne = useAction(stopTask)
  const stopReply = useAction(stopTaskSession)
  const runAgain = useAction(runTask)
  const reorder = useAction(reorderWorkroomAgents)

  const counts = view?.counts
  const all = view?.projects.flatMap(p => p.agents) ?? []
  const stopAllWhy = counts && counts.running + counts.waiting > 0 ? undefined : 'Nothing of yours is running'
  const header = (
    <Button variant="secondary" leadingIcon={<Square size={14} aria-hidden className="fill-current" />} disabled={!view || !!stopAllWhy} title={stopAllWhy} onClick={() => setStopping(true)}>
      Stop every run…
    </Button>
  )

  const controlsOf = (p: WorkroomProject, a: WorkroomAgent): CardControls => {
    const viewer = p.personal || mayWorkIn(p.projectId) ? undefined : VIEWER_CANNOT_WORK
    return {
      startWhy: p.personal ? 'Start from your space' : 'Start from the project’s Workroom',
      startTitle: 'Start from the project’s Workroom',
      onStop: () => act(`${a.name} was not stopped`, () => stopMine({ projectId: p.projectId, agentId: a.agentId })),
      stopWhy: viewer ?? (a.now.length + a.line.length === 0 ? 'Nothing is running' : undefined),
      stopTitle: stopTitle(a),
      onStopRun: (r: WorkroomNow) => act('The run was not stopped', () => (r.taskId ? stopOne({ taskId: r.taskId }) : stopReply({ sessionId: r.sessionId! }))),
      stopRunWhy: viewer,
      onAnswer: (n: WorkroomNeed) => (n.reason === 'failed'
        ? act(`${n.taskKey} was not run again`, () => runAgain({ taskId: n.taskId }))
        : navigate(n.href)),
      answerWhy: viewer,
    }
  }
  const entriesOf = (p: WorkroomProject): CardEntry[] => (onlyNeeds ? p.agents.filter(a => a.needs.length > 0) : p.agents).map(a => ({
    key: `${p.projectId}:${a.agentId}`, agent: a, controls: controlsOf(p, a),
    quiet: quietLine(a, { nothingYet: false, mine: true }),
    place: { name: p.projectName, href: workroomHref(p) }, where: p.projectName,
  }))

  let body
  if (error) body = <ReadFailure what="The Workrooms" error={error} retry={() => void refetch()} />
  else if (!view || !counts) body = <p className="text-small text-text-muted">Reading your Workrooms…</p>
  else {
    const cards = countCards(counts, { across: true, needsAgents: all.filter(a => a.needs.length > 0).length }).map(c => ({
      ...c,
      onChoose: c.key === 'spent' ? undefined : c.key === 'needs' ? () => setOnlyNeeds(v => !v) : () => navigate(`/runs?state=${c.key}`),
      chosen: c.key === 'needs' && onlyNeeds,
    }))
    const groups = view.projects.filter(p => !onlyNeeds || p.agents.some(a => a.needs.length > 0))
    body = (
      <>
        <Scorecards label="Your runs today" items={cards} className="" />
        <UnansweredSitesNotice copy={unansweredSitesCopy(view.unanswered, "today's runs")} className="mt-3" />
        <div className="mt-4 border-t border-border-subtle" />
        <h2 className="pb-2 pt-4 text-h3 font-medium text-text-primary max-lg:hidden">Agents at work, by project</h2>
        {view.projects.length === 0 ? (
          <EmptyState variant="inline" title="No agent works in a project of yours yet. When one does, what it is doing for you shows here." />
        ) : groups.length === 0 ? (
          <EmptyState variant="inline" title="Nothing needs you." action={<Button variant="secondary" onClick={() => setOnlyNeeds(false)}>Show every agent</Button>} />
        ) : phone ? (
          <AgentCards entries={groups.flatMap(entriesOf)} now={now} />
        ) : (
          groups.map(p => (
            <Fragment key={p.projectId}>
              <div className="flex items-center gap-2 pb-2 pt-4 first-of-type:pt-0">
                <PlaceAvatar kind="project" id={p.projectId} name={p.projectName} size="sm" />
                <Link to={workroomHref(p)} className={`inline-flex items-center rounded text-h3 font-medium text-text-primary hover:underline ${FOCUS_RING}`}>
                  {p.projectName}<ChevronRight size={16} aria-hidden />
                </Link>
              </div>
              <AgentCards
                entries={entriesOf(p).map(e => ({ ...e, place: undefined }))} now={now}
                onReorder={!p.personal && !onlyNeeds && mayWorkIn(p.projectId)
                  ? keys => act('The order was not changed', () => reorder({ projectId: p.projectId, agentIds: keys.map(k => k.slice(p.projectId.length + 1)) }))
                  : undefined}
              />
            </Fragment>
          ))
        )}
        <p className="pt-2 text-small text-text-muted">
          Every run, in every project, is on <Link to="/runs" className={LINK}>Runs<ChevronRight size={14} aria-hidden /></Link>, the organisation’s history.
        </p>
      </>
    )
  }

  return (
    <AppLayout
      screenBarEdge
      breadcrumbs={[{ label: TITLE }]} title={TITLE} subtitle={SUBTITLE} action={header}
      phoneActions={view ? [{ label: 'Stop every run…', onSelect: () => setStopping(true), disabledWhy: stopAllWhy }] : undefined}
    >
      <div className="px-4 py-6 lg:px-6 max-lg:px-3 max-lg:py-3">{body}</div>
      {stopping && (
        <StopEveryRunDialog
          where="your projects" whose="yours" agents={all} busy={busy} onCancel={() => setStopping(false)}
          onStop={() => act('Not every run of yours was stopped', () => stopMine({}), () => setStopping(false))}
        />
      )}
      {attention}
    </AppLayout>
  )
}
