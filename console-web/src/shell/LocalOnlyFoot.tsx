import { StatePill } from '@agenthix/ui/primitives'

const LOOPBACK = new Set(['127.0.0.1', 'localhost', '[::1]', '::1'])

/** True when the page was opened at this machine's own loopback address, not through remote access. */
export const openedLocally = (hostname: string) => LOOPBACK.has(hostname)

/**
 * The foot of every screen. The page says what is true of how it was opened: on the machine's own address it is
 * served to that machine alone; opened at any other name, it came through remote access.
 */
export function LocalOnlyFoot() {
  if (!openedLocally(window.location.hostname)) {
    return (
      <footer className="flex items-center gap-2 border-t border-border-subtle bg-frame-sidebar px-4 py-2 text-micro text-text-muted">
        <StatePill tone="warning">Remote access</StatePill>
        <span>This session came through remote access. It works only here, and ends when remote access ends.</span>
      </footer>
    )
  }
  return (
    <footer className="flex items-center gap-2 border-t border-border-subtle bg-frame-sidebar px-4 py-2 text-micro text-text-muted">
      <StatePill>Local only</StatePill>
      <span>Opened on this machine alone, at {window.location.hostname}.</span>
    </footer>
  )
}
