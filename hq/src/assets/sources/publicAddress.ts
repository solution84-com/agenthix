import net from 'node:net'

/**
 * Whether hq may connect to an address it is asked to fetch from: only a public unicast address on the internet.
 * Anything on this machine, a private or carrier network, link-local (cloud metadata services), multicast,
 * unspecified, documentation or reserved, in IPv4 or IPv6, is refused — and so is an IPv6 address that only wraps an
 * IPv4 one (compatible, NAT64, 6to4), except an IPv4-mapped address whose IPv4 address is public. Takes a literal
 * address only; anything else, a host name or a shorthand IPv4 form such as `127.1`, is refused.
 */
export function isPublicAddress(value: string): boolean {
  const address = value.startsWith('[') && value.endsWith(']') ? value.slice(1, -1) : value
  const kind = net.isIP(address)
  if (kind === 4) return isPublicIpv4(ipv4Octets(address))
  if (kind === 6) {
    const groups = ipv6Groups(address)
    return groups !== null && isPublicIpv6(groups)
  }
  return false
}

const REFUSED_IPV4: Array<[number, number, number, number, number]> = [
  [0, 0, 0, 0, 8], // "this network", 0.0.0.0 included
  [10, 0, 0, 0, 8],
  [100, 64, 0, 0, 10], // carrier-grade NAT
  [127, 0, 0, 0, 8],
  [169, 254, 0, 0, 16], // link-local, where cloud metadata services answer
  [172, 16, 0, 0, 12],
  [192, 0, 0, 0, 24],
  [192, 0, 2, 0, 24],
  [192, 168, 0, 0, 16],
  [198, 18, 0, 0, 15],
  [198, 51, 100, 0, 24],
  [203, 0, 113, 0, 24],
  [224, 0, 0, 0, 3], // multicast (224/4) and reserved (240/4), broadcast included
]

function isPublicIpv4(octets: number[]): boolean {
  const value = toUint32(octets)
  return !REFUSED_IPV4.some(([a, b, c, d, bits]) => {
    const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0
    return ((value & mask) >>> 0) === ((toUint32([a, b, c, d]) & mask) >>> 0)
  })
}

const toUint32 = (o: number[]) => ((o[0] << 24) | (o[1] << 16) | (o[2] << 8) | o[3]) >>> 0

const ipv4Octets = (address: string) => address.split('.').map(Number)

function isPublicIpv6(g: number[]): boolean {
  const zeroUpTo = (n: number) => g.slice(0, n).every((x) => x === 0)
  if (zeroUpTo(5) && g[5] === 0xffff) return isPublicIpv4(embedded(g[6], g[7])) // ::ffff:a.b.c.d
  if (zeroUpTo(6)) return false // ::, ::1 and the IPv4-compatible ::a.b.c.d
  if (g[0] === 0x2002) return false // 6to4, deprecated: whatever it wraps, nobody publishes packages there
  if ((g[0] & 0xe000) !== 0x2000) return false // outside global unicast 2000::/3: fc00::/7, fe80::/10, ff00::/8, 64:ff9b::/96, 100::/64…
  if (g[0] === 0x2001 && g[1] < 0x0200) return false // 2001::/23, IETF protocol assignments (Teredo among them)
  if (g[0] === 0x2001 && g[1] === 0x0db8) return false // documentation
  if (g[0] === 0x3fff && g[1] < 0x1000) return false // documentation, 3fff::/20
  return true
}

const embedded = (high: number, low: number) => [high >> 8, high & 0xff, low >> 8, low & 0xff]

/** The eight 16-bit groups of a valid IPv6 address (already checked by `net.isIP`), its zone dropped. */
function ipv6Groups(address: string): number[] | null {
  let text = address.split('%')[0].toLowerCase()
  const dotted = /(\d+\.\d+\.\d+\.\d+)$/.exec(text)
  if (dotted) {
    const [a, b, c, d] = ipv4Octets(dotted[1])
    text = `${text.slice(0, -dotted[1].length)}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`
  }
  const [head, tail] = text.includes('::') ? text.split('::') : [text, null]
  const parse = (part: string) => (part === '' ? [] : part.split(':').map((h) => parseInt(h, 16)))
  const front = parse(head)
  const back = tail === null ? [] : parse(tail)
  const missing = 8 - front.length - back.length
  if (tail === null ? missing !== 0 : missing < 0) return null
  const groups = [...front, ...new Array<number>(missing).fill(0), ...back]
  return groups.every((x) => Number.isInteger(x) && x >= 0 && x <= 0xffff) ? groups : null
}
