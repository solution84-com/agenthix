import { useCallback, useState } from 'react'

const STORAGE_KEY = 'navCollapsed'

function readStored(): boolean {
  try { return localStorage.getItem(STORAGE_KEY) === '1' } catch { return false }
}

// Kept in the browser, so the choice survives a reload as well as navigation.
export function useNavCollapsed(): [boolean, () => void] {
  const [collapsed, setCollapsed] = useState(readStored)
  const toggle = useCallback(() => {
    setCollapsed(prev => {
      const next = !prev
      try { localStorage.setItem(STORAGE_KEY, next ? '1' : '0') } catch { /* storage unavailable: keep it for this page only */ }
      return next
    })
  }, [])
  return [collapsed, toggle]
}
