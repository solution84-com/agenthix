import { useQuery, useAction, getProjectBoards, unarchiveBoard } from 'wasp/client/operations'
import { BoardsList, type BoardListItem } from '@agenthix/ui/board'
import { useMayWork } from '../../shared/hooks/useMayWork'

/** How often the list reads the boards again, so "N needs you" keeps up while the person talks. */
const BOARDS_REFRESH_MS = 15_000

export function BoardsListScreen({ projectId, archived, onOpen, onNew, onShowArchived, onShowActive }: {
  projectId: string
  archived: boolean
  onOpen: (boardId: string) => void
  onNew: () => void
  onShowArchived: () => void
  onShowActive: () => void
}) {
  const { data, isLoading, refetch } = useQuery(getProjectBoards, { projectId, includeArchived: true }, { refetchInterval: BOARDS_REFRESH_MS })
  const unarchiveFn = useAction(unarchiveBoard)
  const canChange = useMayWork(projectId)
  const all: BoardListItem[] = data ?? []
  const shown = all.filter(b => (archived ? !!b.archivedAt : !b.archivedAt))
  if (isLoading) return <p className="px-4 py-6 text-small text-text-muted">Loading…</p>
  return (
    <BoardsList
      boards={shown}
      archivedCount={all.filter(b => !!b.archivedAt).length}
      showingArchived={archived}
      onOpen={onOpen}
      onNew={canChange ? onNew : undefined}
      onShowArchived={onShowArchived}
      onShowActive={onShowActive}
      onUnarchive={canChange ? id => { void unarchiveFn({ boardId: id }).then(() => refetch()) } : undefined}
    />
  )
}
