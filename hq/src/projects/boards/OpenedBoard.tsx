import { useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { OverflowMenu, TasksViewHeader, NewTaskRow, TASK_BUTTON } from '@agenthix/ui/tasks'
import {
  BoardColumnsView, BoardBox, EditColumnsModal, ModeSwitch, RoundLineBar, useElementWidth,
  type BoardCardData, type BoardLayout, type ShowAlsoGroup,
} from '@agenthix/ui/board'
import { CreateTaskModal } from '../pages/CreateTaskModal'
import { useIsMobile } from '../../shared/hooks/useIsMobile'
import { useMayWork, VIEWER_CANNOT_WORK } from '../../shared/hooks/useMayWork'
import { boardMenuItems } from './boardMenu'
import { cardMenuItems } from './cardMenu'
import { FinishSprintScreen } from './FinishSprintScreen'
import { PastSprintTasks } from './PastSprintTasks'
import { useOpenedBoard } from './useOpenedBoard'
import { useThreadMarkedCards } from './threadMarks'
import { AgentProfileTrigger } from '../../agents/profile/AgentProfileCard'

/** Wide enough for the columns to sit side by side. */
const SIDE_BY_SIDE_PX = 640
const HEADER_WORDS_PX = 520
const NO_CARDS: BoardCardData[] = []
const NO_GROUPS: ShowAlsoGroup[] = []

export type BoardTimelineRenderer = (board: { id: string; projectId: string }) => ReactNode

/**
 * One board, opened inside the Boards tool (every screen reviewed spec §3): its box, and its columns laid out
 * to the room there is. `renderTimeline` is the Timeline tool's view of this board; without it the
 * Columns · Timeline switch is not shown.
 */
export function OpenedBoard({ boardId, mode, sprintId, onBack, onOpenTask, onMode, onViewSprint, onDeleted, renderTimeline }: {
  boardId: string
  mode: 'columns' | 'timeline' | 'finish'
  sprintId: string | null
  onBack: () => void
  onOpenTask: (taskKey: string) => void
  onMode: (mode: 'timeline' | 'finish' | null) => void
  onViewSprint: (sprintId: string | null) => void
  onDeleted: () => void
  renderTimeline?: BoardTimelineRenderer
}) {
  const [pastWanted, setPastWanted] = useState(false)
  const b = useOpenedBoard(boardId, { pastSprintsWanted: pastWanted, viewedSprintId: sprintId })
  const canChange = useMayWork(b.board?.projectId)
  const isMobile = useIsMobile()
  const { ref, width } = useElementWidth<HTMLDivElement>(320)
  const [now] = useState(() => new Date())
  const [adding, setAdding] = useState(false)
  const [modalTitle, setModalTitle] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [notice, setNotice] = useState('')
  const { board } = b
  const marked = useThreadMarkedCards(board?.projectId, board?.tasks ?? NO_CARDS, board?.backlog ?? NO_CARDS, board?.showAlso ?? NO_GROUPS)

  const layout: BoardLayout = width >= SIDE_BY_SIDE_PX ? 'columns' : isMobile ? 'chips' : 'stacked'
  // Room in the header for the buttons' words; below it, their icons alone (named for screen readers and on hover).
  const roomy = width >= HEADER_WORDS_PX
  const attempt = async (what: () => Promise<unknown>) => {
    setNotice('')
    try { await what() } catch (e) { setNotice(e instanceof Error ? e.message : 'That did not work') }
  }

  const taskCountByColumn = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const t of board?.tasks ?? []) if (t.column) counts[t.column] = (counts[t.column] ?? 0) + 1
    return counts
  }, [board?.tasks])

  if (b.error || (!b.isLoading && !board)) {
    return <div><TasksViewHeader back="Boards" onBack={onBack} /><p className="px-4 pt-3 text-small text-text-muted">That board was not found.</p></div>
  }
  if (!board) return <p className="px-4 py-6 text-small text-text-muted">Loading…</p>

  const archived = !!board.archivedAt
  const isDefault = board.kind === 'PROJECT_TASKS'
  const workable = canChange && !archived
  const sprint = board.currentSprint

  if (mode === 'finish' && sprint && board.kind === 'SPRINTS') {
    const open = board.tasks.filter(t => t.status !== 'DONE').length
    const lengthDays = Math.max(1, Math.round((new Date(sprint.finishDate ?? 0).getTime() - new Date(sprint.startDate ?? 0).getTime()) / 86_400_000))
    return (
      <FinishSprintScreen
        boardName={board.name} sprint={sprint} doneCount={board.tasks.length - open} unfinishedCount={open} lengthDays={lengthDays}
        onBack={() => onMode(null)} onFinish={async dest => { await b.finish(dest); onMode(null) }}
      />
    )
  }

  const menuCtx = {
    boardId: board.id, columns: board.columns, otherBoards: b.otherBoards, canChange: workable,
    moveToColumn: (c: BoardCardData, column: string | null) => attempt(() => b.moveToColumn(c.id, column)),
    moveToBoard: (c: BoardCardData, to: string) => attempt(() => b.moveToBoard(c.id, to)),
  }
  const headerMenu = boardMenuItems({
    kind: board.kind, archived, canChange,
    onEditColumns: () => setEditing(true),
    onArchive: () => attempt(async () => { await b.archive(); onBack() }),
    onUnarchive: () => attempt(() => b.unarchive()),
    onDelete: () => attempt(async () => { await b.remove(); onDeleted() }),
  })
  const toggleStarts = (name: string) => attempt(() => b.saveColumns(board.columns.map(c => (c.name === name ? { ...c, autoQueue: !c.autoQueue } : c))))
  const timeline = renderTimeline?.({ id: board.id, projectId: board.projectId })
  const showingTimeline = mode === 'timeline' && !!renderTimeline

  const body = sprintId ? (
    <PastSprintTasks tasks={b.viewedTasks} now={now} onOpen={c => onOpenTask(c.taskKey)} />
  ) : showingTimeline ? timeline : (
    <BoardColumnsView
      layout={layout} boardId={board.id} columns={board.columns} cards={marked.cards} backlog={marked.backlog} showAlso={marked.showAlso}
      backlogNote={board.kind === 'SPRINTS' ? 'not in a sprint' : undefined}
      showAlsoPicker={b.showAlso ? { boardName: board.name, options: b.showAlso.options, chosen: b.showAlso.boardIds, onChange: ids => void attempt(() => b.setShowAlso(ids)) } : undefined}
      now={now} onOpen={c => onOpenTask(c.taskKey)}
      onMove={workable ? (c, column) => void attempt(() => b.moveToColumn(c.id, column)) : undefined}
      menuFor={(c: BoardCardData, from: ShowAlsoGroup | null) => cardMenuItems(c, from, menuCtx)}
      onToggleStarts={!isDefault && workable ? name => void toggleStarts(name) : undefined}
      linkRoutine={(routineId, children) => <Link to={`/routines/${routineId}`}>{children}</Link>}
      linkAgent={(agentId, children) => <AgentProfileTrigger agentId={agentId}>{children}</AgentProfileTrigger>}
    />
  )

  return (
    <div ref={ref} className="@container pb-6">
      <TasksViewHeader
        back="Boards" onBack={onBack} title={board.name}
        action={
          <>
            {renderTimeline && <ModeSwitch mode={showingTimeline ? 'timeline' : 'columns'} onChange={m => onMode(m === 'timeline' ? 'timeline' : null)} labelled={roomy} />}
            {workable && (
              <button type="button" className={TASK_BUTTON} aria-label="Add task" title="Add task" onClick={() => setAdding(true)}>
                ＋{roomy && ' Add task'}
              </button>
            )}
            <OverflowMenu items={headerMenu} label="Board menu" />
          </>
        }
      />
      {archived && (
        <p className="mx-4 mt-3 rounded-xl border border-border-subtle bg-surface-2 px-3 py-2 text-small text-text-secondary">
          This board is archived. {canChange && !isDefault ? 'Unarchive it from ⋯ to work on it.' : ''}
        </p>
      )}
      {!canChange && <p className="px-4 pt-2 text-micro text-text-muted">{VIEWER_CANNOT_WORK}</p>}
      {adding && (
        <NewTaskRow
          onAdd={async title => { await b.addTask(board.projectId, title); setNotice(`Added to ${board.name}'s Backlog.`) }}
          onClose={() => setAdding(false)}
          onMoreDetails={title => { setAdding(false); setModalTitle(title) }}
        />
      )}
      {notice && <p role="status" className="px-4 pt-2 text-small text-text-secondary">{notice}</p>}
      <BoardBox
        sprint={sprint}
        pastSprints={b.sprints} onOpenPast={() => setPastWanted(true)}
        viewingSprint={b.viewedSprint} onViewSprint={onViewSprint}
        onFinish={workable ? () => onMode('finish') : undefined}
        onRename={workable && sprint ? name => b.rename(sprint.id, name) : undefined}
      />
      {board.roundLine && <div className="pt-3"><RoundLineBar line={board.roundLine} /></div>}
      <div className="pt-3">{body}</div>
      {editing && (
        <EditColumnsModal
          columns={board.columns} taskCountByColumn={taskCountByColumn}
          onSave={cols => b.saveColumns(cols)} onClose={() => setEditing(false)}
        />
      )}
      <CreateTaskModal
        open={modalTitle !== null} onClose={() => setModalTitle(null)} projectId={board.projectId}
        defaultBoardId={board.id} defaultTitle={modalTitle ?? ''} onCreated={() => { setModalTitle(null); setNotice('Added.'); void b.reload() }}
      />
    </div>
  )
}
