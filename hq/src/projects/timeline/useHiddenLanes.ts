import { useCallback, useState } from 'react'

const keyOf = (projectId: string) => `timeline-hidden-types:${projectId}`

function read(projectId: string): Set<string> {
  try {
    const raw = window.localStorage.getItem(keyOf(projectId))
    const parsed: unknown = raw ? JSON.parse(raw) : []
    return new Set(Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [])
  } catch {
    return new Set()
  }
}

/** The lanes, task types, a person chose not to show (Types ▾), remembered per project in this browser only. */
export function useHiddenLanes(projectId: string): [ReadonlySet<string>, (laneId: string) => void] {
  const [hidden, setHidden] = useState<ReadonlySet<string>>(() => read(projectId))
  const toggle = useCallback((laneId: string) => {
    setHidden(prev => {
      const next = new Set(prev)
      if (!next.delete(laneId)) next.add(laneId)
      try { window.localStorage.setItem(keyOf(projectId), JSON.stringify([...next])) } catch { /* private window: the choice lasts this visit */ }
      return next
    })
  }, [projectId])
  return [hidden, toggle]
}
