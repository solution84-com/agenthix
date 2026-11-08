import { useState } from 'react'
import { Plus } from 'lucide-react'
import { useQuery, useAction, getBoardViews, getBoardChoices, duplicateBoardView, deleteBoardView, updateBoardView } from 'wasp/client/operations'
import { Button } from '@agenthix/ui/primitives'
import { TasksListHeading } from '@agenthix/ui/tasks'
import { SavedBoardsList, type BoardMenuItem, type BoardRowData } from '@agenthix/ui/board'
import { useAttention } from '../../shared/components/AttentionDialog'
import { refusalText } from '../../shared/refusal'
import { useMayWork } from '../../shared/hooks/useMayWork'
import { usePhoneActions } from '../../shared/layouts/phoneActions'
import type { BoardListEntry } from '../boardListService'
import type { BoardChoices } from '../boardChoices'
import { DeleteBoardDialog, RenameBoardDialog } from './BoardDialogs'
import { boardWhat, colsOf } from './boardViewModel'
import { VIEWER_CANNOT_CHANGE } from './useBoardActions'
import type { BoardKey } from './useBoardsToolUrl'
import type { ViewOverrides } from './boardViewModel'

/** A board of the list as its row draws it: what it groups by and its filter in words. */
export function boardRow(b: BoardListEntry, choices: BoardChoices | undefined): BoardRowData {
  return {
    key: b.key, name: b.name, builtIn: b.builtIn, kind: b.kind, spread: b.spread, needsYouCount: b.needsYouCount, lastMovedAt: b.lastMovedAt,
    what: boardWhat({ kind: b.kind, typeId: b.typeId, fieldId: b.fieldId, filter: b.filter }, { typeName: b.typeName, fieldName: b.fieldName }, choices),
  }
}

/**
 * A project's Boards (BS1, N5, the board design's Saved boards): the two built-in boards, then every saved board, each
 * with its spread; New board opens an unsaved view. Each saved board's ⋯ has Open, Rename…, Duplicate and Delete….
 */
export function BoardsListScreen({ projectId, onOpen }: {
  projectId: string
  onOpen: (board: BoardKey, overrides?: ViewOverrides) => void
}) {
  const { data, refetch } = useQuery(getBoardViews, { projectId })
  const { data: choices } = useQuery(getBoardChoices, { projectId })
  const mayWork = useMayWork(projectId)
  const attention = useAttention()
  const duplicateFn = useAction(duplicateBoardView)
  const deleteFn = useAction(deleteBoardView)
  const renameFn = useAction(updateBoardView)
  const [renaming, setRenaming] = useState<BoardListEntry | null>(null)
  const [deleting, setDeleting] = useState<BoardListEntry | null>(null)
  const [now] = useState(() => new Date())
  const boards: BoardListEntry[] = data ?? []
  const why = mayWork ? undefined : VIEWER_CANNOT_CHANGE
  const onPhone = usePhoneActions([{ label: 'New board', onSelect: () => onOpen('new'), disabledWhy: why }])

  const attempt = (title: string, work: () => Promise<unknown>) => {
    work().then(() => refetch(), err => attention.show({ title, text: refusalText(err), retry: () => attempt(title, work) }))
  }
  const entryOf = (row: BoardRowData) => boards.find(b => b.key === row.key)!
  const menuFor = (row: BoardRowData): BoardMenuItem[] => {
    const b = entryOf(row)
    if (b.builtIn) {
      return [
        { label: 'Open', onSelect: () => onOpen(b.key) },
        { label: 'New board from this', hint: 'an unsaved view to change and save', onSelect: () => onOpen('new', { cols: colsOf(b) }), disabledReason: why },
      ]
    }
    return [
      { label: 'Open', onSelect: () => onOpen(b.key) },
      { label: 'Rename…', onSelect: () => setRenaming(b), disabledReason: why },
      { label: 'Duplicate', onSelect: () => attempt(`${b.name} was not copied`, () => duplicateFn({ boardId: b.id! })), disabledReason: why },
      { label: 'Delete…', danger: true, separatorBefore: true, onSelect: () => setDeleting(b), disabledReason: why },
    ]
  }

  return (
    <div className="pb-6">
      <div className="[&>div]:px-6 max-sm:[&>div]:px-3">
        <TasksListHeading
          title="Boards" compact={onPhone} counts="Every board is a way of looking at the project's tasks"
          action={<Button leadingIcon={<Plus size={16} aria-hidden />} disabled={!mayWork} title={why} onClick={() => onOpen('new')}>New board</Button>}
        />
      </div>
      {data === undefined
        ? <p className="px-6 py-4 text-small text-text-muted">Loading…</p>
        : <SavedBoardsList boards={boards.map(b => boardRow(b, choices))} now={now} onOpen={row => onOpen(row.key)} menuFor={menuFor} />}
      {renaming && (
        <RenameBoardDialog
          initial={renaming.name} onCancel={() => setRenaming(null)}
          onRename={name => { const b = renaming; setRenaming(null); attempt(`${b.name} was not renamed`, () => renameFn({ boardId: b.id!, name })) }}
        />
      )}
      {deleting && (
        <DeleteBoardDialog
          name={deleting.name} taskCount={deleting.spread.reduce((n, p) => n + p.count, 0)} fieldName={deleting.fieldName}
          onCancel={() => setDeleting(null)}
          onDelete={() => { const b = deleting; setDeleting(null); attempt(`${b.name} was not deleted`, () => deleteFn({ boardId: b.id! })) }}
        />
      )}
      {attention.dialog}
    </div>
  )
}
