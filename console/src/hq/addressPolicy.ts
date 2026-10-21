/**
 * The console's link to hq carries its credential and every fleet admin's password on its way to `signIn.check`, so
 * hq's address must not send them in the clear across a network the console does not control: https, or plain http
 * only to this machine or a private network. On hq's machine (the pairing secret is set) a single-label name is a
 * container on the private Docker network the two share, allowed when every address it resolves to is private — the
 * rule the site applies to its own pairing.
 */
import dns from 'node:dns/promises'
import { HQ_CONSOLE_LINK_PATH } from '@agenthix/core'

export type ResolveAll = (hostname: string) => Promise<string[]>

const resolveAll: ResolveAll = async hostname => (await dns.lookup(hostname, { all: true })).map(r => r.address)

export async function hqAddressProblem(
  raw: string,
  { onHqMachine, resolve = resolveAll }: { onHqMachine: boolean; resolve?: ResolveAll },
): Promise<string | null> {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return `CONSOLE_HQ_ADDRESS is not an address: "${raw}". Give hq's full address, e.g. https://hq.example.com`
  }
  if (url.protocol === 'https:') return null
  if (url.protocol !== 'http:') return `hq's address must start with https:// (got ${url.protocol}//)`
  if (isLocal(url.hostname)) return null
  const refusal = `Refusing http://${url.hostname}: the Fleet Console would send its credential and people's passwords there unencrypted. Use https://, or an address on this machine or a private network.`
  if (!onHqMachine || !isContainerName(url.hostname)) return refusal
  let addresses: string[]
  try {
    addresses = await resolve(url.hostname)
  } catch {
    addresses = []
  }
  return addresses.length > 0 && addresses.every(isPrivateAddress) ? null : refusal
}

/** The console link's websocket address, from hq's address. */
export function consoleLinkUrl(hqAddress: string): string {
  const url = new URL(hqAddress)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  url.pathname = HQ_CONSOLE_LINK_PATH
  url.search = ''
  url.hash = ''
  return url.toString()
}

function isLocal(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, '').toLowerCase()
  if (host === 'localhost' || host.endsWith('.localhost') || host === 'host.docker.internal' || host === '::1') return true
  return isPrivateIpv4(host)
}

function isPrivateIpv4(host: string): boolean {
  const m = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(host)
  if (!m) return false
  const a = Number(m[1]), b = Number(m[2])
  return a === 127 || a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254)
}

function isPrivateAddress(address: string): boolean {
  const a = address.toLowerCase()
  if (isPrivateIpv4(a)) return true
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(a)
  if (mapped) return isPrivateIpv4(mapped[1])
  return a === '::1' || /^f[cd][0-9a-f]{2}:/.test(a) || /^fe[89ab][0-9a-f]:/.test(a)
}

function isContainerName(hostname: string): boolean {
  return /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/i.test(hostname) && !/^\d+$/.test(hostname)
}
