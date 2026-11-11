import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { MessageSquare, Play, Plus } from 'lucide-react'
import { Button, PopSheet } from '@agenthix/ui/primitives'
import { isFinal, useBackgroundRead } from '@agenthix/ui/attention'
import { OverflowMenu } from '@agenthix/ui/tasks'
import {
  BoardChip, BoardHeader, BoardMenuItems, BoardToolbar, ManualOrderNote, PhoneBoardToolbar, PhoneColumns, ViewChangedControls,
  ViewColumns, useElementWidth, type ViewCardData, type ViewColumnData,
} from '@agenthix/ui/board'
import { useMayWork } from '../../shared/hooks/useMayWork'
import { usePhoneActions } from '../../shared/layouts/phoneActions'
import { usePlaceCrumb, usePlaceOwnTalk } from '../../places/placeCrumb'
import { useDock } from '../../dock/DockContext'
import { columnsMenu, filterControls } from './boardControls'
import { cardMenu } from './boardCardMenu'
import { emptyWords, finishingColumn, slotWords, viewColumns } from './boardCards'
import { boardHeaderButtons, boardPhoneActions, useBoardActions } from './useBoardActions'
import { columnsLabel, countsLine, overridesFor, type ViewOverrides, type ViewSpec } from './boardViewModel'
import { useBoardScreen } from './useBoardScreen'
import { useBoardStartAll } from './useBoardStartAll'
import type { BoardKey } from './useBoardsToolUrl'

const PHONE_WIDTH = 640
const NOT_DRAGGED = 'Cards here move by themselves, as their runs do.'

export interface BoardScreenProject { id: string; key: string; name: string }

/**
 * One board (B1–B6, D3, D14, D18, N2): its header, Columns and filters, and its columns of cards in rank order, or on a
 * phone one column at a time. A view changed on screen is not saved until the person says so; leaving it asks nothing.
 */
export function BoardScreen({ project, board, overrides, onBack, onBoard, onView, onOpenTask, hidden = false }: {
  project: BoardScreenProject
  board: BoardKey
  overrides: ViewOverrides
  onBack: () => void
  onBoard: (board: BoardKey, overrides?: ViewOverrides) => void
  onView: (overrides: ViewOverrides) => void
  onOpenTask: (taskKey: string) => void
  /** Kept mounted behind an open task, so its scroll is kept. */
  hidden?: boolean
}) {
  const navigate = useNavigate()
  const dock = useDock()
  const mayWork = useMayWork(project.id)
  const s = useBoardScreen({ projectId: project.id, board, overrides })
  const { ref: widthRef, width } = useElementWidth<HTMLDivElement>(1200)
  const phone = width < PHONE_WIDTH
  const [search, setSearch] = useState('')
  const [unfolded, setUnfolded] = useState<Set<string>>(new Set())
  const [phoneColumn, setPhoneColumn] = useState<string | null>(null)
  const [held, setHeld] = useState<ViewCardData | null>(null)
  const title = board === 'new' ? 'New board · not saved' : s.base?.saved?.name ?? (board === 'execution' ? 'Execution' : 'Task state')
  usePlaceCrumb(hidden ? null : title)

  const view = s.view
  const setView = (next: ViewSpec) => s.base && onView(overridesFor(s.base.spec, next))
  const actions = useBoardActions({ project, s, board, onBoard, onBack })
  const columns = useMemo(() => {
    const drawn = actions.local ?? (s.read ? viewColumns(s.read) : [])
    const q = search.trim().toLowerCase()
    if (!q) return drawn
    return drawn.map(c => {
      const cards = c.cards.filter(x => x.title.toLowerCase().includes(q) || x.key.toLowerCase().includes(q))
      return { ...c, cards, count: cards.length }
    })
  }, [actions.local, s.read, search])

  const backgroundRead = useBackgroundRead(s.background, { what: 'The board', pollMs: 15_000 })
  const talk = dock ? () => dock.startNew({ kind: 'project', key: project.key }, null) : null
  const startAll = useBoardStartAll({ projectId: project.id, projectName: project.name, mayWork, onStarted: () => void s.refetch() })
  const phoneRows = boardPhoneActions({ board, s, actions, mayWork, talk, startAll: startAll.open, reset: () => onView({}) })
  const onPhone = usePhoneActions(hidden ? null : phoneRows)
  usePlaceOwnTalk(!hidden && !!talk)

  const gone = !view && !s.loading && !s.error
  if (backgroundRead.failedWithoutData || gone) {
    return (
      <div className={hidden ? 'hidden' : 'px-6 py-6'}>
        {gone || isFinal(s.error)
          ? <p className="text-body text-text-primary">This board is not here any more: someone deleted it, or it is not one of {project.name}'s.</p>
          : backgroundRead.nudge}
        <Button variant="secondary" className="mt-3" onClick={onBack}>Back to Boards</Button>
      </div>
    )
  }
  if (!view || !s.read) return <p className={hidden ? 'hidden' : 'px-6 py-6 text-small text-text-muted'}>Loading…</p>

  const read = s.read
  const readOnly = view.kind === 'EXECUTION'
  const choices = s.choices
  const saved = board !== 'new'
  const counts = countsLine(view, choices, { total: read.totalCount, shown: read.shownCount }, saved)
  const folded = new Set(columns.filter(c => finishingColumn(view, c) && !unfolded.has(c.key)).map(c => c.key))
  const menuCtx = {
    columns, readOnly, mayWork, choices, phone, sprintOf: actions.sprintOf,
    on: {
      open: (c: ViewCardData) => onOpenTask(c.key),
      run: actions.run, stop: actions.stop, setSprint: actions.setSprint,
      openInRuns: () => navigate(`/projects/${encodeURIComponent(project.key)}?tool=runs`),
      moveTo: (c: ViewCardData, column: string, place: 'bottom' | { afterTaskId: string | null; beforeTaskId: string | null }) =>
        actions.moveTo(columns, c, column, place),
    },
  }
  const chips = board === 'new' ? null : (
    <>
      <BoardChip>{s.base?.saved ? 'Saved board' : 'Built in'}</BoardChip>
      {readOnly && <BoardChip outlined>Read-only</BoardChip>}
    </>
  )
  const shown = boardHeaderButtons({ width, startAll: startAll.open, talk, moreItems: actions.moreItems })
  const headerActions = (
    <>
      {shown.startAll && <Button variant="secondary" leadingIcon={<Play size={14} aria-hidden className="fill-current" />} onClick={shown.startAll}>Start all agents…</Button>}
      {shown.talk && <Button variant="secondary" leadingIcon={<MessageSquare size={14} aria-hidden />} onClick={shown.talk}>Talk about this board</Button>}
      <OverflowMenu items={shown.moreItems} label="More on this board" />
      {board === 'new'
        ? <Button disabled={!mayWork} title={mayWork ? undefined : actions.viewerWhy} onClick={actions.openSave}>Save as board</Button>
        : <Button leadingIcon={<Plus size={16} aria-hidden />} disabled={!mayWork} title={mayWork ? undefined : actions.viewerWhy} onClick={() => actions.newTask(null)}>New task</Button>}
    </>
  )
  const columnMenuOf = (c: ViewColumnData) =>
    actions.columnMenu(view, c, finishingColumn(view, c), () => setUnfolded(u => { const n = new Set(u); n.delete(c.key); return n }))
  const columnsItems = columnsMenu(view, choices, setView)
  const filters = filterControls(view, choices, setView)
  const end = board !== 'new' && s.changed
    ? <ViewChangedControls builtIn={!s.base?.saved} saveChangesWhy={actions.saveChangesWhy} onReset={() => onView({})} onSaveAsNew={actions.openSave} onSaveChanges={actions.saveChanges} />
    : board === 'new' ? null : <ManualOrderNote />

  return (
    <div ref={widthRef} className={hidden ? 'hidden' : 'flex h-full min-h-0 flex-col'}>
      <BoardHeader
        onBack={onBack} title={title} current={board} onPick={key => onBoard(key)} hideOnPhone={onPhone}
        boards={(s.boards ?? []).map(b => ({ value: b.key, label: b.name, hint: b.builtIn ? 'Built in' : undefined }))}
        chips={chips} counts={counts} actions={<div className={`flex items-center gap-2 ${onPhone ? 'max-lg:hidden' : ''}`}>{headerActions}</div>}
      />
      {backgroundRead.nudge && <div className="px-6">{backgroundRead.nudge}</div>}
      {phone
        ? <PhoneBoardToolbar columnsLabel={columnsLabel(view, choices)} columns={columnsItems} filters={filters} search={search} onSearch={setSearch} shownCount={read.shownCount} onReset={() => onView({})} />
        : <BoardToolbar columnsLabel={columnsLabel(view, choices)} columns={columnsItems} filters={filters} search={search} onSearch={setSearch} end={end} />}
      {phone ? (
        <PhoneColumns
          columns={columns} current={phoneColumn ?? columns[0]?.key ?? ''} onColumn={setPhoneColumn} showType={read.mixesTypes}
          held={held?.id ?? null} onOpen={c => onOpenTask(c.key)} onHold={setHeld} emptyWords={emptyWords(view, choices)}
          columnMenu={columnMenuOf}
        />
      ) : (
        <ViewColumns
          columns={columns} showType={read.mixesTypes} readOnlyWhy={readOnly ? NOT_DRAGGED : null}
          onOpen={c => onOpenTask(c.key)} menuFor={c => cardMenu(c, menuCtx)} columnMenu={columnMenuOf}
          onDrop={d => actions.drop(columns, d)} slotWords={(c, place) => slotWords(view, choices, columns, c, place)}
          folded={folded} onUnfold={key => setUnfolded(u => new Set(u).add(key))}
          faded={view.kind === 'FIELD' ? new Set(['none']) : undefined} emptyWords={emptyWords(view, choices)} narrow={readOnly}
        />
      )}
      {held && (
        <PopSheet label={`Actions for ${held.key}`} onClose={() => setHeld(null)}>
          <BoardMenuItems heading={`${held.key} · ${held.title}`} items={cardMenu(held, menuCtx)} onClose={() => setHeld(null)} />
        </PopSheet>
      )}
      {actions.dialogs}
      {startAll.dialog}
    </div>
  )
}
