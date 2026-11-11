import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { ChevronRight } from 'lucide-react'
import { Button, FOCUS_RING, FOCUS_RING_INSET } from '@agenthix/ui/primitives'
import { MoreMenu } from '../../org/components/menus'
import { VIEWER_CANNOT_WORK } from '../../shared/hooks/useMayWork'
import type { SprintSummary } from '../projectSprintView'
import { SprintStateBar } from './SprintStateBar'
import { SprintAgentMark, SprintTaskFacts, type SprintCard } from './SprintTaskBits'
import { ColumnChip } from '../components/TypeStateColumns'
import { planSprintPath, sprintBoardPath, taskPath } from './sprintPaths'
import { atWorkText, sprintSpanText, sprintTimeText } from './sprintWords'

/** How many of the sprint's tasks show before "N more". */
const SHOWN = 4
const GRID = 'grid grid-cols-[72px_120px_minmax(0,1fr)_150px_120px] items-center gap-x-4'
const LINK = `inline-flex items-center gap-0.5 whitespace-nowrap rounded text-link hover:underline ${FOCUS_RING}`

function SprintTable({ tasks }: { tasks: SprintCard[] }) {
  return (
    <div role="table" aria-label="The sprint's tasks" className="mt-3 max-md:hidden">
      <div role="row" className={`${GRID} pb-1.5 text-micro font-medium text-text-muted`}>
        <span role="columnheader">Key</span><span role="columnheader">Agent</span><span role="columnheader">Task</span>
        <span role="columnheader">Type</span><span role="columnheader">Column</span>
      </div>
      {tasks.map(t => (
        <Link key={t.id} role="row" to={taskPath(t.key)} className={`${GRID} min-h-11 border-t border-border-subtle hover:bg-surface-hover active:bg-surface-pressed ${FOCUS_RING_INSET}`}>
          <span role="cell" className="font-mono text-micro text-text-muted">{t.key}</span>
          <span role="cell" className="flex min-w-0 items-center gap-1.5 text-small text-text-secondary">
            {t.agent ? <><SprintAgentMark task={t} /><span className="truncate">{t.agent.name}</span></> : <span className="text-text-muted">None</span>}
          </span>
          <span role="cell" className="truncate text-small font-medium text-text-primary">{t.title}</span>
          <span role="cell" className="truncate text-micro text-text-secondary">{t.type?.name ?? ''}</span>
          <span role="cell" className="min-w-0">{t.column && <ColumnChip name={t.column.name} />}</span>
        </Link>
      ))}
    </div>
  )
}

function SprintRows({ tasks }: { tasks: SprintCard[] }) {
  return (
    <ul aria-label="The sprint's tasks" className="md:hidden">
      {tasks.map(t => (
        <li key={t.id} className="border-t border-border-subtle">
          <Link to={taskPath(t.key)} className="flex min-h-13 items-center gap-2 py-1">
            <span className="flex w-10 shrink-0 justify-center"><SprintAgentMark task={t} /></span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-small font-medium text-text-primary">{t.title}</span>
              <SprintTaskFacts task={t} />
            </span>
          </Link>
        </li>
      ))}
    </ul>
  )
}

/**
 * The current sprint (the design's keys 1–3): its title, dates and days left (or how long ago its last day was: N7),
 * See it on a board, Finish sprint…, Rename in ⋯; how it is going by task state; what is at work now, as a line that
 * opens the Workroom; and its tasks in rank order, each agent ringed with its run (D18).
 */
export function CurrentSprintCard({ sprint, tasks, projectKey, mayChange, workroomHref, onFinish, onRename }: {
  sprint: SprintSummary
  tasks: SprintCard[] | undefined
  projectKey: string
  mayChange: boolean
  workroomHref: string
  onFinish: () => void
  onRename: () => void
}) {
  const [all, setAll] = useState(false)
  const navigate = useNavigate()
  const why = mayChange ? undefined : VIEWER_CANNOT_WORK
  const time = sprintTimeText(sprint)
  const atWork = atWorkText(sprint.atWork)
  const shown = tasks ? (all ? tasks : tasks.slice(0, SHOWN)) : []
  const more = tasks ? tasks.length - shown.length : 0
  const board = <Link to={sprintBoardPath(projectKey, sprint.id)} className={`${LINK} text-small`}>See {sprint.title} on a board<ChevronRight size={14} aria-hidden /></Link>

  return (
    <section aria-label={`${sprint.title}, current`} className="rounded-xl border border-border bg-card p-4 max-lg:p-3">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <h3 className="min-w-0 truncate text-h3 font-medium text-text-primary">{sprint.title}</h3>
        <span className="rounded-full bg-chip px-2.5 text-micro leading-[18px] text-text-primary">current</span>
        <span className={`whitespace-nowrap text-micro max-lg:basis-full max-lg:order-last ${sprint.daysOverdue > 0 ? 'text-warning' : 'text-text-secondary'}`}>
          {sprintSpanText(sprint.startDate, sprint.finishDate)} · {time}
        </span>
        <span className="flex-1" />
        <span className="max-lg:hidden">{board}</span>
        <Button variant="secondary" className="max-lg:hidden" disabled={!mayChange} title={why} onClick={onFinish}>Finish sprint…</Button>
        <MoreMenu label={`${sprint.title}: more`} items={[{ label: 'Rename…', disabled: !mayChange, title: why, onSelect: onRename }]} />
      </div>
      <div className="mt-3"><SprintStateBar counts={sprint.counts} /></div>
      <div className="mt-3 flex gap-2 lg:hidden">
        <Button variant="secondary" className="flex-1 justify-center" disabled={!mayChange} title={why} onClick={onFinish}>Finish sprint…</Button>
        <Button variant="secondary" className="flex-1 justify-center" onClick={() => navigate(sprintBoardPath(projectKey, sprint.id))}>On a board</Button>
      </div>
      <p className="mt-2 text-small text-text-muted max-lg:mt-3">
        {atWork ?? 'Nothing at work now'}{' · '}
        <Link to={workroomHref} className={LINK}>Workroom<ChevronRight size={14} aria-hidden /></Link>
      </p>
      {!tasks ? <p className="mt-3 text-small text-text-muted">Loading the sprint's tasks…</p> : tasks.length === 0 ? (
        <p className="mt-3 border-t border-border-subtle pt-3 text-small text-text-muted">
          Nothing is planned in it yet.{' '}
          <Link to={planSprintPath(projectKey, sprint.id)} className={LINK}>Plan {sprint.title}<ChevronRight size={14} aria-hidden /></Link>
        </p>
      ) : (
        <>
          <SprintTable tasks={shown} />
          <SprintRows tasks={shown} />
          <p className="mt-2 border-t border-border-subtle pt-2 text-small text-text-muted">
            In rank order
            {more > 0 && <>{' · '}<button type="button" onClick={() => setAll(true)} className={LINK}>{more} more<ChevronRight size={14} aria-hidden /></button></>}
          </p>
        </>
      )}
    </section>
  )
}
