import { StatePill } from '@agenthix/ui/primitives'

/**
 * The foot of every screen: the page is served to this machine alone. Remote access (plan
 * 4.14) will replace it with the session notice and the time left while it is on; until then it is always off.
 */
export function LocalOnlyFoot() {
  return (
    <footer className="flex items-center gap-2 border-t border-border-subtle bg-frame-sidebar px-4 py-2 text-micro text-text-muted">
      <StatePill>Local only</StatePill>
      <span>Served to this machine alone, at 127.0.0.1 — nothing on the network can open it. Remote access is off.</span>
    </footer>
  )
}
