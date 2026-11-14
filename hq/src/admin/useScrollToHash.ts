import { useEffect } from 'react'
import { useLocation } from 'react-router'

/**
 * Scrolls to the element the address's anchor names once the part of the page drawing it is `ready`. Each section of a
 * page whose content arrives on its own read calls it, so a link to a line drawn late still lands on it.
 */
export function useScrollToHash(ready: boolean) {
  const { hash } = useLocation()
  useEffect(() => {
    if (!hash || !ready) return
    document.getElementById(decodeURIComponent(hash.slice(1)))?.scrollIntoView?.({ block: 'start' })
  }, [hash, ready])
}
