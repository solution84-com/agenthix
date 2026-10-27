import { useEffect, useState } from 'react'
import { resolveAgentImageUrl } from '../utils/agentImageUrl'

/**
 * Resolves a stored picture path into a link to HQ's relay, through the
 * shared cache in agentImageUrl.ts (see that file for how long a link is kept). Returns null until resolved, and while
 * `rawUrl` itself is null — the caller renders its own fallback (initials,
 * gradient) for both cases exactly as it did for a missing image before.
 */
export function useAgentImageUrl(rawUrl: string | null | undefined): string | null {
  const [resolved, setResolved] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setResolved(null)
    resolveAgentImageUrl(rawUrl).then((url) => {
      if (!cancelled) setResolved(url)
    })
    return () => {
      cancelled = true
    }
  }, [rawUrl])

  return resolved
}
