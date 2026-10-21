/**
 * How many proxies stand in front of hq-server (ADR-0067). A caller's address
 * is read from X-Forwarded-For counting this many hops back, and approving a
 * site and every per-address throttle rely on it. One is hq-web alone; each
 * front door in front of hq-web adds one. Too high lets a caller supply their
 * own address; too low lumps every caller under the proxy's.
 */
export function trustedProxyCount(raw: string | undefined = process.env.HQ_TRUSTED_PROXIES): number {
  if (raw === undefined || raw.trim() === '') return 1
  const n = Number(raw.trim())
  if (!Number.isInteger(n) || n < 0) {
    throw new Error(`HQ_TRUSTED_PROXIES must be a whole number of proxies in front of hq-server (got "${raw}")`)
  }
  return n
}
