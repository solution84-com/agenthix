import { createElement, Fragment, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { useAction, duplicateBoardView, deleteBoardView, updateBoardView } from 'wasp/client/operations'
import type { OverflowItem } from '@agenthix/ui/tasks'
import type { BoardMenuItem, CardDrop, ViewCardData, ViewColumnData } from '@agenthix/ui/board'
import { useAttention } from '../../shared/components/AttentionDialog'
import { refusalText } from '../../shared/refusal'
import { useMayWork } from '../../shared/hooks/useMayWork'
import type { PhoneAction } from '../../shared/layouts/phoneActions'
import { defaultColumnFor, movedColumns } from './boardCards'
import { boardWhat, filterWords, sameColumns, type ViewSpec } from './boardViewModel'
import { DeleteBoardDialog, RenameBoardDialog, SaveBoardDialog } from './BoardDialogs'
import type { useBoardScreen } from './useBoardScreen'
import type { BoardKey } from './useBoardsToolUrl'

type Screen = ReturnType<typeof useBoardScreen>

export const VIEWER_CANNOT_CHANGE = 'Viewers can look, not change: ask a project admin to make you a member.'
export const BUILT_IN_STAYS = (name: string) => `${name} is built in and stays as it is. Save as a new board to keep this view.`
export const SAVED_KEEPS_COLUMNS = 'A saved board keeps what it groups by. Save as a new board to keep these columns.'

/**
 * What the board screen does: drops and moves (drawn at once, then written), a card's run, its sprint, and saving,
 * renaming, copying and deleting the board. A refusal is said in the one centred dialog, never in the board's layout.
 */
export function useBoardActions({ project, s, board, onBoard, onBack }: {
  project: { id: string; key: string; name: string }
  s: Screen
  board: BoardKey
  onBoard: (board: BoardKey) => void
  onBack: () => void
}) {
  const navigate = useNavigate()
  const mayWork = useMayWork(project.id)
  const attention = useAttention()
  const duplicateFn = useAction(duplicateBoardView)
  const deleteFn = useAction(deleteBoardView)
  const renameFn = useAction(updateBoardView)
  const [local, setLocal] = useState<ViewColumnData[] | null>(null)
  const [dialog, setDialog] = useState<'save' | 'rename' | 'delete' | null>(null)
  const saved = s.base?.saved ?? null
  const view = s.view

  const attempt = (title: string, work: () => Promise<unknown>) => {
    work().catch(err => attention.show({ title, text: refusalText(err), retry: () => attempt(title, work) }))
  }

  const place = (columns: ViewColumnData[], card: ViewCardData, column: string, neighbours: { afterTaskId: string | null; beforeTaskId: string | null }) => {
    setLocal(movedColumns(columns, card.id, column, neighbours))
    s.drop({ taskId: card.id, column, ...neighbours })
      .catch(err => attention.show({ title: `${card.key} was not moved`, text: refusalText(err) }))
      .finally(() => setLocal(null))
  }

  const sprintOfCard = new Map((s.read?.columns ?? []).flatMap(c => c.cards.map(card => [card.id, card.sprintId] as const)))
  const what = view ? boardWhat(view, { typeName: s.read?.board.typeName ?? null, fieldName: s.read?.board.fieldName ?? null }, s.choices) : ''
  const saveChangesWhy = !saved ? BUILT_IN_STAYS(s.read?.board.name ?? 'This board')
    : view && s.base && !sameColumns(s.base.spec, view) ? SAVED_KEEPS_COLUMNS
      : !mayWork ? VIEWER_CANNOT_CHANGE : null

  const newTask = (columnId: string | null) => {
    const query = columnId ? `?column=${encodeURIComponent(columnId)}` : view?.kind === 'TYPE' && view.typeId ? `?type=${encodeURIComponent(view.typeId)}` : ''
    navigate(`/projects/${encodeURIComponent(project.key)}/tasks/new${query}`)
  }

  const moreItems: OverflowItem[] = [
    { label: 'Save as new board…', onSelect: () => setDialog('save'), disabledReason: mayWork ? undefined : VIEWER_CANNOT_CHANGE },
    ...(saved ? [
      { label: 'Rename…', onSelect: () => setDialog('rename'), disabledReason: mayWork ? undefined : VIEWER_CANNOT_CHANGE },
      { label: 'Duplicate', onSelect: () => attempt(`${saved.name} was not copied`, async () => onBoard((await duplicateFn({ boardId: saved.id! })).id)), disabledReason: mayWork ? undefined : VIEWER_CANNOT_CHANGE },
      { label: 'Delete…', danger: true, separatorBefore: true, onSelect: () => setDialog('delete'), disabledReason: mayWork ? undefined : VIEWER_CANNOT_CHANGE },
    ] : []),
  ]

  const columnMenu = (spec: ViewSpec, column: ViewColumnData, finishing: boolean, fold: () => void): BoardMenuItem[] => {
    const into = spec.kind === 'TYPE' ? column.key
      : spec.kind === 'STATE' ? defaultColumnFor(s.choices, s.choices?.types.find(t => t.kind === 'TASK')?.id, column.key)?.id ?? null
        : null
    return [
      ...(into ? [{ label: `New task in ${column.name}`, onSelect: () => newTask(into), disabledReason: mayWork ? undefined : VIEWER_CANNOT_CHANGE }] : []),
      ...(finishing ? [{ label: 'Fold to a strip', onSelect: fold }] : []),
      ...(spec.kind === 'TYPE' && spec.typeId
        ? [{ label: 'Edit columns in Settings', separatorBefore: true, onSelect: () => navigate(`/projects/${encodeURIComponent(project.key)}/settings/types/${encodeURIComponent(spec.typeId!)}`) }]
        : []),
    ]
  }

  const filterLine = view ? [what.split(' · ')[0], ...filterWords(view.filter, s.choices)].join(' · ') : ''
  let dialogs: ReactNode = null
  if (dialog === 'save') {
    dialogs = createElement(SaveBoardDialog, {
      projectName: project.name, shows: filterLine, onCancel: () => setDialog(null),
      onSave: (name: string) => attempt('The board was not saved', async () => { const b = await s.saveAsNew(name); setDialog(null); onBoard(b.id) }),
    })
  } else if (dialog === 'rename' && saved) {
    dialogs = createElement(RenameBoardDialog, {
      initial: saved.name, onCancel: () => setDialog(null),
      onRename: (name: string) => attempt(`${saved.name} was not renamed`, async () => { await renameFn({ boardId: saved.id!, name }); setDialog(null) }),
    })
  } else if (dialog === 'delete' && saved) {
    dialogs = createElement(DeleteBoardDialog, {
      name: saved.name, taskCount: s.read?.totalCount ?? 0, fieldName: s.read?.board.fieldName ?? null, onCancel: () => setDialog(null),
      onDelete: () => attempt(`${saved.name} was not deleted`, async () => { await deleteFn({ boardId: saved.id! }); setDialog(null); onBack() }),
    })
  }

  return {
    local,
    viewerWhy: VIEWER_CANNOT_CHANGE,
    saveChangesWhy,
    moreItems,
    columnMenu,
    newTask,
    dialogs: createElement(Fragment, null, dialogs, attention.dialog),
    openSave: () => setDialog('save'),
    saveChanges: () => attempt('The changes were not saved', () => s.saveChanges().then(() => onBoard(board))),
    sprintOf: (card: ViewCardData) => sprintOfCard.get(card.id) ?? null,
    drop: (columns: ViewColumnData[], d: CardDrop) => place(columns, d.card, d.column, { afterTaskId: d.afterTaskId, beforeTaskId: d.beforeTaskId }),
    moveTo: (columns: ViewColumnData[], card: ViewCardData, column: string, at: 'bottom' | { afterTaskId: string | null; beforeTaskId: string | null }) => {
      const target = columns.find(c => c.key === column)
      const others = target?.cards.filter(c => c.id !== card.id) ?? []
      const last = others[others.length - 1]
      place(columns, card, column, at === 'bottom' ? { afterTaskId: last?.id ?? null, beforeTaskId: null } : at)
    },
    run: (card: ViewCardData) => attempt(`${card.key} did not start`, () => s.run(card.id)),
    stop: (card: ViewCardData) => attempt(`${card.key} was not stopped`, () => s.stop(card.id)),
    setSprint: (card: ViewCardData, sprintId: string | null) => attempt(`${card.key}'s sprint was not changed`, () => s.setSprint(card.id, sprintId)),
  }
}

/** Below these board widths the header's long buttons fold into its ⋯, so the board's name keeps its width. */
export const FOLD_START_ALL_BELOW = 1040
export const FOLD_TALK_BELOW = 820

/**
 * The header's buttons at the board's width: Start all agents… folds into ⋯ first, then Talk about this board; ⋯ then
 * lists them first, above the board's own items.
 */
export function boardHeaderButtons({ width, startAll, talk, moreItems }: {
  width: number
  startAll: (() => void) | null
  talk: (() => void) | null
  moreItems: OverflowItem[]
}): { startAll: (() => void) | null; talk: (() => void) | null; moreItems: OverflowItem[] } {
  const foldStart = !!startAll && width < FOLD_START_ALL_BELOW
  const foldTalk = !!talk && width < FOLD_TALK_BELOW
  const tucked: OverflowItem[] = [
    ...(foldStart && startAll ? [{ label: 'Start all agents…', onSelect: startAll }] : []),
    ...(foldTalk && talk ? [{ label: 'Talk about this board', onSelect: talk }] : []),
  ]
  return {
    startAll: foldStart ? null : startAll,
    talk: foldTalk ? null : talk,
    moreItems: tucked.length === 0 ? moreItems : [...tucked, ...moreItems.map((i, n) => (n === 0 ? { ...i, separatorBefore: true } : i))],
  }
}

/**
 * The board's actions behind the phone top bar's ⋯ (phone D): New task first (Save as board on a new view), then Talk
 * about this board, the saving actions once the view is changed, and the board's own.
 */
export function boardPhoneActions({ board, s, actions, mayWork, talk, startAll, reset }: {
  board: BoardKey
  s: Screen
  actions: ReturnType<typeof useBoardActions>
  mayWork: boolean
  talk: (() => void) | null
  /** Start all agents…, for someone who may work in the project. */
  startAll: (() => void) | null
  reset: () => void
}): PhoneAction[] {
  const why = mayWork ? undefined : VIEWER_CANNOT_CHANGE
  const first: PhoneAction = board === 'new'
    ? { label: 'Save as board', onSelect: actions.openSave, disabledWhy: why }
    : { label: 'New task', onSelect: () => actions.newTask(null), disabledWhy: why }
  const changed = s.changed && board !== 'new'
  const notSaved = s.view ? filterWords(s.view.filter, s.choices).join(' · ') : ''
  return [
    first,
    ...(startAll ? [{ label: 'Start all agents…', onSelect: startAll }] : []),
    ...(talk ? [{ label: 'Talk about this board', onSelect: talk }] : []),
    ...(changed ? [
      { label: 'Save changes', hint: notSaved && s.base?.saved ? `${notSaved} is not saved on ${s.base.saved.name} yet` : undefined, onSelect: actions.saveChanges, disabledWhy: actions.saveChangesWhy ?? undefined },
      { label: 'Save as new board…', onSelect: actions.openSave, disabledWhy: why },
      { label: 'Reset', onSelect: reset },
    ] : actions.moreItems.map(i => ({ label: i.label, danger: i.danger, disabledWhy: i.disabledReason, onSelect: () => void i.onSelect() }))),
  ]
}
