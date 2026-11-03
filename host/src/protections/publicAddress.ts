/**
 * The public address hq sees this machine from (live preview spec section 6; core's `HqSeenFromFrame`): behind a router,
 * the router's own, whose forwarded ports lead back into the organisation's network, so live previews must not reach
 * it (`public-address`). hq says it as each connection of the host link opens. Kept in the state folder
 * (`link/public-address.json`, beside the link it arrives on), newest first; only public IPv4 addresses are kept, since
 * a private one is already covered by `private-addresses` and live previews' networks carry no IPv6.
 */
import type { StateFolder } from '../state/folder'
import { isIpv4, NOT_PUBLIC } from './rules'

const FILE = ['link', 'public-address.json']
/** The most addresses kept: a machine whose router's address changes keeps the last few closed. */
const MOST = 4

const asNumber = (a: string): number => a.split('.').reduce((n, o) => n * 256 + Number(o), 0)

function covered(range: string, address: number): boolean {
  const [addr, bits] = range.split('/')
  const size = 2 ** (32 - Number(bits))
  const first = Math.floor(asNumber(addr!) / size) * size
  return address >= first && address < first + size
}

/** Whether an address is one the public internet routes, so it means something as the machine's public address. */
export function isPublicIpv4(a: string): boolean {
  return isIpv4(a) && !NOT_PUBLIC.some(range => covered(range, asNumber(a)))
}

export function readPublicAddresses(state: StateFolder): string[] {
  const v = state.readJson(...FILE) as { addresses?: unknown } | null
  return Array.isArray(v?.addresses) ? v.addresses.filter((a): a is string => typeof a === 'string' && isPublicIpv4(a)).slice(0, MOST) : []
}

/**
 * Records the address hq said it sees this machine from. Anything but a public IPv4 address is not kept. Answers
 * whether the record changed, so the rules are checked again at once.
 */
export function recordPublicAddress(state: StateFolder, address: unknown, now: Date): boolean {
  if (typeof address !== 'string') return false
  const a = address.trim()
  if (!isPublicIpv4(a)) return false
  const before = readPublicAddresses(state)
  if (before[0] === a) return false
  state.writeJson(FILE, { addresses: [a, ...before.filter(b => b !== a)].slice(0, MOST), seenAt: now.toISOString() })
  return true
}
