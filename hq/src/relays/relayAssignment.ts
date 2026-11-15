import {
  RELAY_PASS_RENEWAL_FRACTION, RELAY_PASS_TTL_SECONDS,
  type ProtocolVersion, type RelayAssignParams, type RelayAssignResult,
} from '@agenthix/core'
import type { Placement } from './placement'
import type { SignedRelayToken } from './relayTokens'
import { Logger } from '../server/utils/logger'

const logger = new Logger('RelayAssignment')

/** After a failed assignment, hq tries again this soon, well inside the old pass's life. */
export const ASSIGN_RETRY_MS = 60_000
export const PASS_RENEWAL_MS = RELAY_PASS_TTL_SECONDS * 1000 * RELAY_PASS_RENEWAL_FRACTION

export type RelayAssignmentDeps = {
  /** The site's live control-channel connection, compared by identity to tell a reconnect from the same link. */
  connection(siteId: string): { protocol: ProtocolVersion } | null
  request(siteId: string, params: RelayAssignParams): Promise<RelayAssignResult>
  place(siteId: string): Promise<Placement | null>
  signPass(input: { siteId: string; relayId: string }): Promise<SignedRelayToken>
}

/**
 * Tells each connected site which relay to hold its file line to, with a pass, and renews the pass before it ends
 * while the same connection lasts (`RELAY_PASS_RENEWAL_FRACTION` of its life). A reconnect starts afresh; a site with no
 * relay available is sent nothing, and nothing else about its connection changes.
 */
export function createRelayAssigner(deps: RelayAssignmentDeps) {
  const timers = new Map<string, ReturnType<typeof setTimeout>>()

  function schedule(siteId: string, conn: object, delayMs: number): void {
    clearTimeout(timers.get(siteId))
    const timer = setTimeout(() => {
      timers.delete(siteId)
      if (deps.connection(siteId) === conn) void assign(siteId, conn)
    }, delayMs)
    timer.unref?.()
    timers.set(siteId, timer)
  }

  async function assign(siteId: string, conn: object): Promise<void> {
    try {
      const placement = await deps.place(siteId)
      if (!placement) {
        logger.info(`site ${siteId}: no relay is available, so its files can't be opened until one is`)
        return
      }
      const pass = await deps.signPass({ siteId, relayId: placement.relayId })
      // The site may have gone, or dialled again, while the pass was being made.
      if (deps.connection(siteId) !== conn) return
      const result = await deps.request(siteId, {
        relayId: placement.relayId, lineUrl: placement.lineUrl, pass: pass.token, passExpiresAt: pass.expiresAt,
      })
      if (!result.taken) {
        logger.warn(`site ${siteId} did not take relay ${placement.relayId}: ${result.problem ?? 'no reason given'}`)
        schedule(siteId, conn, ASSIGN_RETRY_MS)
        return
      }
      schedule(siteId, conn, PASS_RENEWAL_MS)
    } catch (err) {
      logger.warn(`site ${siteId}: relay assignment failed: ${err instanceof Error ? err.message : String(err)}`)
      if (deps.connection(siteId) === conn) schedule(siteId, conn, ASSIGN_RETRY_MS)
    }
  }

  return {
    /** Called once the site's control channel is connected. Never throws. */
    onSiteConnected(siteId: string): Promise<void> {
      const conn = deps.connection(siteId)
      if (!conn) {
        clearTimeout(timers.get(siteId))
        timers.delete(siteId)
        return Promise.resolve()
      }
      return assign(siteId, conn)
    },
    /** Stops every renewal; for tests and shutdown. */
    stop(): void {
      for (const t of timers.values()) clearTimeout(t)
      timers.clear()
    },
  }
}
