/**
 * Where the Fleet Console listens in its container (host-management spec §7). Its compose project gives it a Docker
 * network nothing else joins, with its port published to the machine's 127.0.0.1 only; Docker hands it each such
 * connection from that network's gateway. So it listens on its address on that network, and the gateway is the one
 * peer it accepts there besides the loopback.
 *
 * Both are read inside the container — the default route and the interfaces — never taken from a request or from HQ.
 * On HQ's machine it is also on HQ's link network, to reach hq-web; that network must never be the one it answers
 * on, so a default route through a network HQ is on is refused.
 */
import fs from 'node:fs'
import os from 'node:os'

export type NetworkView = { routes: string; interfaces: NodeJS.Dict<os.NetworkInterfaceInfo[]> }
export type ContainerListen = { address: string; gateway: string; iface: string }

export const readNetworkView = (): NetworkView => ({
  routes: fs.readFileSync('/proc/net/route', 'utf8'),
  interfaces: os.networkInterfaces(),
})

const RTF_UP = 0x1
const RTF_GATEWAY = 0x2

/** The default routes in `/proc/net/route`: destination and mask 0, up, through a gateway. */
export function defaultRoutes(table: string): { iface: string; gateway: string }[] {
  const routes: { iface: string; gateway: string }[] = []
  for (const line of table.split('\n').slice(1)) {
    const [iface, destination, gateway, flags, , , , mask] = line.trim().split(/\s+/)
    if (!iface || destination !== '00000000' || mask !== '00000000' || !gateway || !flags) continue
    const f = parseInt(flags, 16)
    if ((f & RTF_UP) === 0 || (f & RTF_GATEWAY) === 0) continue
    routes.push({ iface, gateway: fromRouteHex(gateway) })
  }
  return routes
}

/** The address and gateway it listens with in its container, or what stops it, in words. */
export function listenInContainer(view: NetworkView, hqAddresses: string[]): ContainerListen | string {
  const routes = defaultRoutes(view.routes)
  if (routes.length === 0) return 'its container has no route out, so it cannot tell which network Docker publishes its port on.'
  if (routes.length > 1) return 'its container has more than one route out, so it cannot tell which network Docker publishes its port on.'
  const { iface, gateway } = routes[0]!
  if (iface === 'lo') return 'its route out is the loopback, not a Docker network.'
  const ipv4 = (view.interfaces[iface] ?? []).filter(a => a.family === 'IPv4' && !a.internal)
  if (ipv4.length === 0) return `its network interface ${iface} has no IPv4 address.`
  if (ipv4.length > 1) return `its network interface ${iface} has more than one IPv4 address.`
  const { address, netmask } = ipv4[0]!
  const mask = toInt(netmask)
  if ((toInt(gateway) & mask) !== (toInt(address) & mask)) return `the gateway ${gateway} is outside its network ${address}/${netmask}.`
  if (gateway === address) return `its address ${address} is its own gateway.`
  if (hqAddresses.some(a => isIpv4(a) && (toInt(a) & mask) === (toInt(address) & mask))) {
    return `HQ is on the network its route out takes (${iface}); it answers only on a network of its own.`
  }
  return { address, gateway, iface }
}

/** `/proc/net/route` writes an address as eight hex digits in the machine's byte order: little-endian here. */
function fromRouteHex(hex: string): string {
  const n = parseInt(hex, 16)
  return [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff].join('.')
}

const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/
const isIpv4 = (a: string) => IPV4.test(a)

function toInt(a: string): number {
  const m = IPV4.exec(a)
  if (!m) return 0
  return ((Number(m[1]) << 24) | (Number(m[2]) << 16) | (Number(m[3]) << 8) | Number(m[4])) >>> 0
}
