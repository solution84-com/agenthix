/**
 * The address *Enter the demo* is limited by. An IPv4 address is its own; an IPv6 address is limited by its /64, the
 * block one connection is usually given, so a visitor cannot take a new address from it for each press.
 */
import { isIPv4, isIPv6 } from 'node:net'

/** The eight groups of an IPv6 address, written out in full; null when it is not one. */
function ipv6Groups(ip: string): string[] | null {
  const halves = ip.split('::')
  if (halves.length > 2) return null
  const part = (s: string) => (s === '' ? [] : s.split(':'))
  const head = part(halves[0])
  const tail = halves.length === 2 ? part(halves[1]) : []
  const missing = 8 - head.length - tail.length
  if (halves.length === 2 ? missing < 1 : missing !== 0) return null
  return [...head, ...Array<string>(halves.length === 2 ? missing : 0).fill('0'), ...tail]
    .map(g => g.toLowerCase().replace(/^0+(?=.)/, ''))
}

export function entryAddress(ip: string): string {
  const bare = ip.trim().replace(/%.*$/, '')
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(bare)
  if (mapped && isIPv4(mapped[1])) return mapped[1]
  if (isIPv4(bare) || !isIPv6(bare)) return bare
  const groups = ipv6Groups(bare)
  return groups ? `${groups.slice(0, 4).join(':')}::/64` : bare
}
