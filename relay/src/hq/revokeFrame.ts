import { RELAY_PROTOCOL_VERSION, checkProtocolCompatibility, type RelayRevoke } from '@agenthix/core'

const MAX_IDS = 10_000
const id = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 512
const ids = (v: unknown): string[] | undefined | null =>
  v === undefined ? undefined : Array.isArray(v) && v.length <= MAX_IDS && v.every(id) ? [...v] : null

/** A `relay.revoke` frame read field by field; null for anything else, or a frame that cuts off nothing. */
export function readRevoke(f: Record<string, unknown>): RelayRevoke | null {
  if (f.type !== 'relay.revoke') return null
  if (!checkProtocolCompatibility(RELAY_PROTOCOL_VERSION, typeof f.version === 'string' ? f.version : null).ok) return null
  if (f.person !== undefined && !id(f.person)) return null
  const apps = ids(f.apps)
  const livePreviews = ids(f.livePreviews)
  const tickets = ids(f.tickets)
  if (apps === null || livePreviews === null || tickets === null) return null
  if (f.person === undefined && !apps?.length && !livePreviews?.length && !tickets?.length) return null
  return {
    type: 'relay.revoke', version: f.version as string,
    ...(f.person === undefined ? {} : { person: f.person as string }),
    ...(apps ? { apps } : {}), ...(livePreviews ? { livePreviews } : {}), ...(tickets ? { tickets } : {}),
  }
}
