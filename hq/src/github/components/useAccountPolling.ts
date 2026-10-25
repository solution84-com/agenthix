import { useCallback, useEffect, useRef, useState } from 'react'
import { checkForGitHubAccounts } from 'wasp/client/operations'

/**
 * No Refresh button (G1): after GitHub sends the person back, HQ asks GitHub again every few seconds for up to a
 * minute. It starts when the page opens and again when an install link is followed. `waiting` is true meanwhile.
 */
export function useAccountPolling(poll: { everyMs: number; forMs: number } | undefined, knownIds: number[], onFound: () => void) {
  const [waiting, setWaiting] = useState(false)
  const known = useRef(knownIds)
  known.current = knownIds
  const found = useRef(onFound)
  found.current = onFound
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)

  const stop = useCallback(() => {
    if (timer.current) clearInterval(timer.current)
    timer.current = null
    setWaiting(false)
  }, [])

  const start = useCallback(() => {
    if (!poll) return
    if (timer.current) clearInterval(timer.current)
    const until = Date.now() + poll.forMs
    setWaiting(true)
    timer.current = setInterval(() => {
      void checkForGitHubAccounts({ knownInstallationIds: known.current }).then((r) => {
        if (r.newInstallationIds.length > 0) { found.current(); stop() }
      }).catch(() => undefined)
      if (Date.now() >= until) stop()
    }, poll.everyMs)
  }, [poll, stop])

  const pollEvery = poll?.everyMs
  const pollFor = poll?.forMs
  useEffect(() => {
    if (pollEvery === undefined || pollFor === undefined) return undefined
    start()
    return () => { if (timer.current) clearInterval(timer.current) }
  }, [pollEvery, pollFor, start])

  return { waiting, start }
}
