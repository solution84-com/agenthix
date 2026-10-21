import { useEffect, useState } from 'react'
import { sessionDetails, type SessionDetails } from '../api/session'

/** The person's HQ account and HQ's own facts, read once where they are drawn; null until read, or when it fails. */
export function useSessionDetails(): SessionDetails | null {
  const [details, setDetails] = useState<SessionDetails | null>(null)
  useEffect(() => {
    let live = true
    sessionDetails().then(d => { if (live) setDetails(d) }).catch(() => {})
    return () => { live = false }
  }, [])
  return details
}
