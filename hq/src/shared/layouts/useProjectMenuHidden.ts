import { useCallback, useState } from 'react'

const STORAGE_KEY = 'placeMenuHidden'

function readStored(): boolean {
  try { return localStorage.getItem(STORAGE_KEY) === '1' } catch { return false }
}

/**
 * Whether a place's menu beside the rail is hidden. Kept in the browser, so the choice holds across places, navigation
 * and a reload.
 */
export function useProjectMenuHidden(): [boolean, () => void] {
  const [hidden, setHidden] = useState(readStored)
  const toggle = useCallback(() => {
    setHidden((prev) => {
      const next = !prev
      try { localStorage.setItem(STORAGE_KEY, next ? '1' : '0') } catch { /* storage unavailable: keep it for this page only */ }
      return next
    })
  }, [])
  return [hidden, toggle]
}
