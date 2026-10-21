import { useCallback, useState } from 'react'

const keyOf = (projectId: string) => `timeline-hidden-boards:${projectId}`

function read(projectId: string): Set<string> {
  try {
    const raw = window.localStorage.getItem(keyOf(projectId))
    const parsed: unknown = raw ? JSON.parse(raw) : []
    return new Set(Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [])
  } catch {
    return new Set()
  }
}

/** The lanes a person chose not to show (Boards ▾), remembered per project in this browser only. */
export function useHiddenBoards(projectId: string): [ReadonlySet<string>, (boardId: string) => void] {
  const [hidden, setHidden] = useState<ReadonlySet<string>>(() => read(projectId))
  const toggle = useCallback((boardId: string) => {
    setHidden(prev => {
      const next = new Set(prev)
      if (!next.delete(boardId)) next.add(boardId)
      try { window.localStorage.setItem(keyOf(projectId), JSON.stringify([...next])) } catch { /* private window: the choice lasts this visit */ }
      return next
    })
  }, [projectId])
  return [hidden, toggle]
}
