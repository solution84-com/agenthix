import { useNavigate } from 'react-router'
import { MessageSquare, Plus } from 'lucide-react'
import { useQuery, useAction, getTaskList, moveTask } from 'wasp/client/operations'
import { Button, EmptyState } from '@agenthix/ui/primitives'
import {
  TasksList, TasksListHeading, TasksScorecards, TasksSelectionBar, TasksToolHeader, filterChips, narrowedLine, orderedColumns,
  scorecardsOf, shownCount, NO_COUNTS, type TaskListCard, type TaskListPageData, type TaskListRowData, type RankPlace,
} from '@agenthix/ui/tasks'
import { useNow } from './useNow'
import { useTaskList } from './useTaskList'
import { useTaskSelection } from './useTaskSelection'
import { useAttention } from '../../shared/components/AttentionDialog'
import { useMayWork, VIEWER_CANNOT_WORK } from '../../shared/hooks/useMayWork'
import { usePlaceOwnTalk, usePlaceTopBarAdd } from '../../places/placeCrumb'
import { usePhoneActions, usePhoneSelection } from '../../shared/layouts/phoneActions'
import { useDock } from '../../dock/DockContext'
import { useBackgroundRead } from '@agenthix/ui/attention'
import { pressFailureWords } from '../../shared/failureWords'

/** How often the list reads its tasks again, so a ring shows a run's progress while the person keeps talking. */
const TASKS_REFRESH_MS = 15_000

export const NO_OPTIONS: TaskListPageData['options'] = { types: [], columns: [], epics: [], sprints: [], agents: [], projects: [], fields: [] }

/**
 * A project's Tasks (T1–T5): the heading with Talk about tasks and New task, the scorecards by task state (Backlog
 * first, then Late and No agent; never a run state), search, filters, Fields and Sort, then one line per task in the
 * project's rank. Sorted by Rank, a line's handle drags it to a new place in the order (D14). The Backlog card is the
 * planning view: its lines can be ticked and acted on together (on a phone, a held touch starts ticking, and the top
 * bar becomes the selection's). A Viewer sees New task greyed, with why, and can neither tick nor drag.
 */
export function ProjectTaskList({ project, initialCard, onOpen, onOpenRun }: {
  project: { id: string; key: string; name: string }
  initialCard: TaskListCard | null
  onOpen: (taskKey: string) => void
  /** A ringed avatar: the task's run. */
  onOpenRun: (taskKey: string) => void
}) {
  const navigate = useNavigate()
  const dock = useDock()
  const list = useTaskList(`project:${project.id}`, 'project', initialCard)
  const query = useQuery(getTaskList, { projectId: project.id, ...list.args }, { refetchInterval: TASKS_REFRESH_MS })
  const { data, isLoading, error, refetch } = query
  const read = useBackgroundRead(query, { what: 'The tasks', pollMs: TASKS_REFRESH_MS })
  const page: TaskListPageData | undefined = data
  const mayWork = useMayWork(project.id)
  const attention = useAttention()
  const readFailed = !!error
  const now = useNow()
  const move = useAction(moveTask)
  const rows = page?.rows ?? NO_ROWS
  const options = page?.options ?? NO_OPTIONS
  const selection = useTaskSelection({
    projectId: project.id, rows, epics: options.epics, enabled: mayWork, onFailure: text => attention.show({ text }),
  })

  const newTask = () => navigate(`/projects/${project.key}/tasks/new`)
  const talk = dock ? () => dock.startNew({ kind: 'project', key: project.key }, null) : null
  const inTopBar = usePlaceTopBarAdd(mayWork ? { label: 'New task', onClick: newTask } : null)
  usePlaceOwnTalk(!!talk)
  usePhoneActions(talk ? [{ label: 'Talk about tasks', onSelect: talk }] : null)
  usePhoneSelection(selection.count > 0 ? {
    count: selection.count, under: `${project.name} · Tasks`, onCancel: selection.clear, actions: selection.actions,
  } : null)

  const columns = orderedColumns(list.columns, options.fields)
  const planning = list.card === 'backlog'
  const epicsByState = list.filters.type === 'Epic'
  // A drop on a narrowed list goes beside the line it was dropped on, which is in view.
  const rankable = mayWork && list.sort === 'rank'
  const reorder = (row: TaskListRowData, place: RankPlace) => {
    move({ taskId: row.id, ...place }).catch(e => {
      void refetch()
      attention.show({ text: pressFailureWords(e, `${row.key} was not moved. Nothing was changed.`) })
    })
  }
  const talkButton = talk && (
    <Button variant="secondary" leadingIcon={<MessageSquare size={14} aria-hidden />} onClick={talk}>Talk about tasks</Button>
  )
  const newTaskButton = (
    <Button leadingIcon={<Plus size={14} aria-hidden />} onClick={newTask} disabled={!mayWork} title={mayWork ? undefined : VIEWER_CANNOT_WORK}>
      New task
    </Button>
  )
  const matching = filterChips(list.filters, 'project', options).map(c => c.label).join(' · ')

  return (
    <div className="pb-6">
      <TasksListHeading
        title="Tasks"
        counts={page && list.narrowed && page.total !== undefined ? narrowedLine({ shown: shownCount(page.counts, list.card), total: page.total }) : null}
        action={<>{talkButton}{newTaskButton}</>} compact={inTopBar}
      />
      {!read.failedWithoutData && read.nudge && <div className="px-6 max-lg:px-3">{read.nudge}</div>}
      <TasksScorecards
        cards={scorecardsOf(page?.counts ?? NO_COUNTS, 'project')} chosen={list.card} onChoose={list.chooseCard}
        loading={!page} failed={readFailed && !page} matching={Object.keys(list.filters).length > 0 || !!list.args.search}
      />
      <TasksToolHeader
        kind="project" search={list.search} onSearch={list.setSearch} filters={list.filters} onFilters={list.setFilters}
        options={options} sort={list.sort} onSort={list.setSort} columns={list.columns} onColumns={list.setColumns}
      />
      {read.failedWithoutData ? (
        read.nudge
      ) : isLoading || !page ? (
        <p className="px-6 py-6 max-lg:px-3 text-small text-text-muted">Loading tasks…</p>
      ) : page.total === 0 && !list.args.archived ? (
        <div className="px-6 pt-4 max-lg:px-3">
          <EmptyState
            variant="inline" title="No tasks yet"
            hint={mayWork ? 'Make one with New task, or ask an agent to plan the work with you.' : 'Nobody has made a task in this project yet.'}
            action={mayWork && talkButton ? talkButton : undefined}
          />
        </div>
      ) : (
        <div className="pt-4">
          <TasksList
            rows={rows} kind="project" now={now} columns={columns} fields={options.fields} byState={epicsByState}
            emptyText={matching ? `No task matches ${matching}` : 'No task matches.'}
            emptyAction={list.narrowed ? <Button variant="secondary" onClick={list.clear}>Clear filters</Button> : undefined}
            hasMore={page.hasMore} onShowMore={list.showMore}
            onOpen={row => onOpen(row.key)} onOpenRun={row => onOpenRun(row.key)}
            selection={mayWork ? { selected: selection.selected, boxes: planning, onToggle: selection.toggle, onLongPress: selection.longPress } : undefined}
            onMove={rankable ? reorder : undefined}
          />
        </div>
      )}
      {selection.count > 0 && (
        <TasksSelectionBar
          count={selection.count} onClear={selection.clear}
          actions={selection.actions.filter(a => !a.label.startsWith('Select all'))}
        />
      )}
      {selection.dialog}
      {attention.dialog}
    </div>
  )
}

const NO_ROWS: TaskListRowData[] = []
