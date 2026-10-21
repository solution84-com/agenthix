import { useEffect, useRef } from 'react'
import { useAuth } from 'wasp/client/auth'
import { useQuery, useAction, getUserSettings, syncBrowserTimezone } from 'wasp/client/operations'

/**
 * Tells hq the browser's timezone, so agents read a person's "9:00" on their
 * clock. Only while the person has not set one themselves: it fills in an empty
 * timezone and follows a person who travels, and never overwrites a choice made
 * on the Profile page. The server decides again; this just avoids asking when
 * nothing would change.
 */
export function useSyncBrowserTimezone(): void {
  const { data: user } = useAuth()
  const { data: settings } = useQuery(getUserSettings, undefined, { enabled: !!user })
  const sync = useAction(syncBrowserTimezone)
  // The zone already sent. Every answer refetches the settings and re-renders the page before the stored zone
  // catches up, so without this each render would send again, and each send refetch again.
  const sent = useRef<string | null>(null)

  const stored: string | null = settings?.timezone ?? null
  const chosen = settings?.timezoneChosen === true
  const loaded = !!settings

  useEffect(() => {
    if (!user || !loaded || chosen) return
    const browser = Intl.DateTimeFormat().resolvedOptions().timeZone
    if (!browser || browser === stored || sent.current === browser) return
    sent.current = browser
    void sync({ timezone: browser }).catch(() => {})
    // `sync` is left out: Wasp's useAction returns a new function on every render.
  }, [user, loaded, chosen, stored]) // eslint-disable-line react-hooks/exhaustive-deps
}
