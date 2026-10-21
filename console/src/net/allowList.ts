/**
 * The addresses remote access answers (pre-release spec B9): checked on the bare connection, before TLS and before
 * any HTTP, so nobody else gets so much as a handshake. Each entry is an IPv4 address or an IPv6 /64, as core's
 * `parseRemoteAllowEntry` reads them; an IPv4 address that arrives mapped into IPv6 (`::ffff:203.0.113.7`) is the
 * IPv4 address.
 */
import net from 'node:net'
import { parseRemoteAllowEntry } from '@agenthix/core'

export type AllowList = { allows: (address: string | undefined) => boolean }

export function allowList(entries: string[]): AllowList {
  const list = new net.BlockList()
  for (const text of entries) {
    const entry = parseRemoteAllowEntry(text)
    if (!entry) throw new Error(`${text} is not an address remote access may answer.`)
    list.addSubnet(entry.network, entry.prefix, entry.family === 4 ? 'ipv4' : 'ipv6')
  }
  return {
    allows: address => {
      if (!address) return false
      const mapped = /^::ffff:(\d{1,3}(\.\d{1,3}){3})$/i.exec(address)
      const plain = mapped ? mapped[1]! : address
      const family = net.isIPv4(plain) ? 'ipv4' : net.isIPv6(plain) ? 'ipv6' : null
      return family !== null && list.check(plain, family)
    },
  }
}
