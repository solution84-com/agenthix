import { useCallback, useState } from 'react'

const keyOf = (boardId: string) => `board-backlog-folded:${boardId}`

function read(boardId: string): boolean {
  try { return window.localStorage.getItem(keyOf(boardId)) === '1' } catch { return false }
}

/** Whether a board's Backlog is folded away, remembered per board in this browser only. */
export function useBacklogFold(boardId: string): { folded: boolean; toggle: () => void } {
  const [state, setState] = useState(() => ({ boardId, folded: read(boardId) }))
  // A different board starts from its own remembered choice.
  const folded = state.boardId === boardId ? state.folded : read(boardId)
  const toggle = useCallback(() => {
    const next = !folded
    setState({ boardId, folded: next })
    try { window.localStorage.setItem(keyOf(boardId), next ? '1' : '0') } catch { /* private window: the choice lasts this visit */ }
  }, [boardId, folded])
  return { folded, toggle }
}
