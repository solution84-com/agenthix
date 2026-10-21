/**
 * The site's own word on why it is not connected (host-management spec §10): read from the site's control
 * socket inside its container, which only a process on this machine can open, as hq's is read (hq/control.ts).
 * Only the cause is taken from the answer, from a closed set; nothing the site says is passed on as text.
 */
import fs from 'node:fs'
import { parseSiteCause, SITE_CAUSES, type SiteCause } from '@agenthix/core'
import type { Docker } from '../docker/docker'

export { SITE_CAUSES, type SiteCause }

/** hq said it moves to `to`, and the address has not passed the site's move check yet (spec §13). */
export type SiteMove = { from: string; to: string; since: string }

/**
 * `replacedAt`: HQ said a restore of this site onto another machine replaced this copy, and when (adr-0119). Taken
 * only from HQ's answer to the site, never from a network failure.
 */
export type SiteReport = { connected: boolean; cause: SiteCause | null; moving?: SiteMove | null; replacedAt?: string | null }

const ADDRESS = /^https?:\/\/[^/\s?#]+\/?$/i
const timeOf = (v: unknown): string | null => (typeof v === 'string' && v.length <= 64 && !Number.isNaN(Date.parse(v)) ? v : null)
const addressOf = (v: unknown): string | null => (typeof v === 'string' && v.length <= 512 && ADDRESS.test(v) ? v : null)

/**
 * Piped into `node` inside the site's container: one `status` request to the site's control socket (the image sets
 * `SITE_CONTROL_SOCKET`), and the first line it answers. Exit 3 means the site is not answering.
 */
export const SITE_STATUS_SCRIPT = `
import net from 'node:net'
const conn = net.createConnection(process.env.SITE_CONTROL_SOCKET)
let reply = ''
conn.setEncoding('utf8')
conn.setTimeout(10000, () => process.exit(3))
conn.on('connect', () => conn.write(JSON.stringify({ command: 'status' }) + '\\n'))
conn.on('data', chunk => {
  reply += chunk
  const end = reply.indexOf('\\n')
  if (end >= 0) { process.stdout.write(reply.slice(0, end) + '\\n'); process.exit(0) }
})
conn.on('error', () => process.exit(3))
`

/** What the site's control socket answered, down to the facts the host service uses; null for anything else. */
export function parseSiteReport(stdout: string): SiteReport | null {
  let value: unknown
  try {
    value = JSON.parse(stdout.trim())
  } catch {
    return null
  }
  const reply = value as {
    type?: unknown
    status?: {
      problem?: unknown; hq?: { connected?: unknown; url?: unknown } | null; moving?: { to?: unknown; since?: unknown } | null
      replaced?: { at?: unknown } | null
    }
  }
  if (reply?.type !== 'status' || typeof reply.status !== 'object' || reply.status === null) return null
  const connected = reply.status.hq?.connected === true
  const cause = parseSiteCause(reply.status?.problem)
  // Only addresses and a time are taken from the site's words, each checked for its shape.
  const from = addressOf(reply.status.hq?.url)
  const to = addressOf(reply.status.moving?.to)
  const since = timeOf(reply.status.moving?.since)
  const replacedAt = connected ? null : timeOf(reply.status.replaced?.at)
  return { connected, cause: connected ? null : cause, moving: from && to && since ? { from, to, since } : null, replacedAt }
}

/** The site's container, as the compose project the host service wrote names it. */
export function siteContainerOf(composeFile: string): string | null {
  try {
    const project = JSON.parse(fs.readFileSync(composeFile, 'utf8')) as { services?: { site?: { container_name?: unknown } } }
    const name = project.services?.site?.container_name
    return typeof name === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(name) ? name : null
  } catch {
    return null
  }
}

export async function readSiteReport(docker: Docker, container: string): Promise<SiteReport | null> {
  const r = await docker.exec(container, ['node', '--input-type=module', '-'], SITE_STATUS_SCRIPT, 15_000)
  return r.code === 0 ? parseSiteReport(r.stdout) : null
}
