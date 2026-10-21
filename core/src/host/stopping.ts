/**
 * A machine that stops on purpose says so, and one that goes quiet otherwise is told apart by how long it has been
 * silent (host-management, the fleet's cards). Browser-safe: no Node import.
 *
 * - **The stop word.** When the host service gets its stop signal (`docker stop`, a shutdown, a restart), it sends
 *   its pinned Fleet Console one `stopping` message, sealed and signed like every envelope, before it exits. It changes
 *   only how the machine's card reads ("Stopped on its machine at …") until the machine answers again; it is never
 *   the machine's consent to anything, and it carries nothing a receiver could act on.
 * - **Silence.** A machine silent for `HOST_SILENT_AFTER_MS` is *not answering*, when its fleet admins asked to be
 *   told; a shorter silence is never alarming, so a restart reads as a restart. hq raises the one notice about it
 *   (`host.silenceFacts`, relay.ts, tells it the setting and the stop).
 */

/** The stop word, as it is sealed inside an envelope (envelope.ts, `HostMessage`). */
export type HostStoppingMessage = { kind: 'stopping' }

/**
 * The most the host service waits, at its stop signal, to send the stop word: well inside Docker's 10-second grace,
 * so a stop is never delayed past it. A link that is down sends nothing, and the service stops at once.
 */
export const HOST_STOPPING_BUDGET_MS = 2_000

/**
 * Silent for this long, a machine whose fleet admins asked to be told is *not answering*: past any restart, upgrade or
 * switch of a host service (spec §10). One threshold everywhere — hq's notice and the Fleet Console's card.
 */
export const HOST_SILENT_AFTER_MS = 10 * 60_000

/** The stop word in a value opened from an envelope; null when it is not exactly that. */
export function parseHostStopping(v: unknown): HostStoppingMessage | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null
  const keys = Object.keys(v)
  return keys.length === 1 && (v as { kind?: unknown }).kind === 'stopping' ? { kind: 'stopping' } : null
}
