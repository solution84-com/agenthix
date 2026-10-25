/**
 * The hosts a workflow's steps may reach, each `host:port` (spec part 1). The egress proxy lets through exactly
 * these pairs; a name is resolved by the proxy, never by the step. A host is a DNS name, an IPv4 address or an IPv6
 * address in brackets, and always has a port: no default port is assumed.
 */
export type WorkflowHost = { host: string; port: number }

const LABEL_RE = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/
const IPV4_RE = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/
const IPV6_RE = /^[0-9a-f:.]+$/

export type ParsedHost = { ok: true; host: WorkflowHost } | { ok: false; reason: string }

export function parseWorkflowHost(raw: string): ParsedHost {
  const bad = (why: string): ParsedHost => ({ ok: false, reason: `"${raw}" is not a host: ${why}` })
  const text = raw.trim().toLowerCase()
  const colon = text.lastIndexOf(':')
  if (colon < 0) return bad('give it as host:port, such as api.github.com:443.')
  const hostPart = text.slice(0, colon)
  const portPart = text.slice(colon + 1)
  if (!/^\d{1,5}$/.test(portPart)) return bad('its port is not a number.')
  const port = Number(portPart)
  if (port < 1 || port > 65535) return bad('its port is not between 1 and 65535.')
  // A step's lookups go to the egress proxy on DNS's port, so no host can be approved on it.
  if (port === 53) return bad('port 53 is where the egress proxy answers a step\'s lookups, so no host can be reached on it.')

  if (hostPart.startsWith('[')) {
    if (!hostPart.endsWith(']')) return bad('an IPv6 address is written in brackets, such as [2001:db8::1]:443.')
    const address = hostPart.slice(1, -1)
    if (!IPV6_RE.test(address) || !address.includes(':')) return bad('the address in brackets is not IPv6.')
    return { ok: true, host: { host: hostPart, port } }
  }
  const v4 = IPV4_RE.exec(hostPart)
  if (v4) {
    if (v4.slice(1).some(o => Number(o) > 255 || (o.length > 1 && o.startsWith('0')))) return bad('it is not an IPv4 address.')
    return { ok: true, host: { host: hostPart, port } }
  }
  if (hostPart.length === 0 || hostPart.length > 253) return bad('its name is empty or too long.')
  const labels = hostPart.split('.')
  if (!labels.every(l => LABEL_RE.test(l))) return bad('its name may hold only letters, digits, hyphens and dots.')
  if (/^\d+$/.test(labels[labels.length - 1])) return bad('its name ends in a number.')
  return { ok: true, host: { host: hostPart, port } }
}

export function formatWorkflowHost(h: WorkflowHost): string {
  return `${h.host}:${h.port}`
}
