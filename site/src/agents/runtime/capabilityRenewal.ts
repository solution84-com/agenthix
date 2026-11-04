import { CAPABILITY_RENEWAL_FRACTION } from '@agenthix/core'

/**
 * §2a proactive renewal: renew at CAPABILITY_RENEWAL_FRACTION of TTL; on failure
 * keep honouring the current capability until it actually expires, retrying
 * meanwhile — hq being down at renewal is the §6 "hq down" mode, not a new one.
 * Transport-agnostic by design: this module never calls hq itself, only the
 * `renew` callback the caller supplies. On the site that callback is
 * `server/hq/capabilityRenewClient.ts`'s `renewCapabilityViaHq`, an HTTP POST
 * to HQ_CAPABILITY_RENEW_PATH (/api/v1/capabilities/renew), passed in as
 * `renew` by AgentEngine.ts.
 */

export interface CapabilityHolder {
  jwt: string
  expiresAt: number // epoch ms
}

const RETRY_INTERVAL_MS = 60_000

export function startCapabilityRenewal(opts: {
  holder: CapabilityHolder
  renew: (currentJwt: string) => Promise<{ capability: string; expiresAt: number }>
  onError?: (err: Error) => void
}): { stop(): void } {
  const { holder, renew, onError } = opts
  let timer: ReturnType<typeof setTimeout> | null = null
  let stopped = false

  const schedule = (delayMs: number) => {
    if (stopped) return
    timer = setTimeout(attempt, Math.max(delayMs, 0))
  }

  const attempt = async () => {
    if (stopped) return
    if (Date.now() >= holder.expiresAt) return // expired — nothing left to honour; stop quietly
    try {
      const next = await renew(holder.jwt)
      // Re-check after the await: if expiry passed while renew() was in flight, the
      // result arrived too late to honour — assigning it would revive an expired
      // holder and contradict the expiry check above. Discard silently, no reschedule.
      if (Date.now() >= holder.expiresAt) return
      holder.jwt = next.capability
      holder.expiresAt = next.expiresAt
      schedule((holder.expiresAt - Date.now()) * CAPABILITY_RENEWAL_FRACTION)
    } catch (err) {
      onError?.(err as Error)
      // Honour the current capability until actual expiry; keep retrying meanwhile.
      if (Date.now() + RETRY_INTERVAL_MS < holder.expiresAt) schedule(RETRY_INTERVAL_MS)
    }
  }

  schedule((holder.expiresAt - Date.now()) * CAPABILITY_RENEWAL_FRACTION)
  return {
    stop() {
      stopped = true
      if (timer) clearTimeout(timer)
    },
  }
}
