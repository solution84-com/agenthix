/**
 * The machine's way into hq (host-management spec §9): a command run inside hq-server against hq's private
 * control socket, which only a process on hq's machine can open. hq's control socket stays hq's only door for the
 * machine's authority; the host service reaches it with `docker exec`, as the installer did before it.
 */
import type { Docker } from '../docker/docker'
import { HQ_CONTROL_SOCKET } from '../compose/projects'
import type { SiteCause } from '../status/siteControl'

/** What hq's control socket answers (hq's `CommandResult`): `code` says what kind of refusal, so no one matches words. */
export type HqCommandResult =
  | { ok: true; text: string; data?: Record<string, unknown> }
  | { ok: false; error: string; code?: 'not_found' | 'conflict' | 'usage' | 'unknown' }

/** hq's `status` command's data. */
export type HqStatusData = {
  users: number
  /** Runs hq has seen start and not end; absent from an hq older than this host service. */
  runningAgents?: number
  hqSite: {
    state: 'connected' | 'notConnected' | 'upgrade' | 'unpaired'
    dockerRunning: boolean | null
    /** Why its own site is not connected, as this host service last told hq. */
    cause?: SiteCause | null
  }
  address: string
  version: string
  commit: string
}

/** What hq's `invite-admin` and `reset-password` answer as data (hq's `LinkData`). */
export type HqLinkData =
  | { kind: 'first_admin'; link: string; validHours: number }
  | { kind: 'invitation'; link: string; validHours: number; toldAdmins: string[] }
  | { kind: 'password_reset'; link: string; validHours: number; person: { name: string; handle: string | null }; toldAdmins: string[] }

export type HqLinkAnswer = { ok: true; data: HqLinkData } | { ok: false; notFound: boolean; error: string }

function isLinkData(data: unknown): data is HqLinkData {
  const d = data as Partial<HqLinkData> | undefined
  return !!d && typeof d.link === 'string' && /^https?:\/\//.test(d.link) &&
    (d.kind === 'first_admin' || d.kind === 'invitation' || d.kind === 'password_reset')
}

/**
 * Piped into `node` inside hq-server: it sends one request to the control socket and prints hq's answer as it
 * came, one JSON line. Plain Node, so it needs nothing beside hq. Exit 3 means hq is not answering.
 *
 * A command's arguments come from its command line, or, for one that carries a secret, from `PRIVATE_ARGS`, which
 * `runPrivately` writes into the piped program itself, so the secret is never an argument of any process.
 */
export const CONTROL_SCRIPT = `
import net from 'node:net'
const command = process.argv[2]
const args = typeof PRIVATE_ARGS !== 'undefined' ? PRIVATE_ARGS : process.argv.slice(3)
const conn = net.createConnection(process.env.HQ_CONTROL_SOCKET || ${JSON.stringify(HQ_CONTROL_SOCKET)})
let reply = ''
conn.setEncoding('utf8')
conn.setTimeout(15000, () => process.exit(3))
conn.on('connect', () => conn.write(JSON.stringify({ command, args }) + '\\n'))
conn.on('data', chunk => { reply += chunk })
conn.on('error', () => process.exit(3))
conn.on('end', () => { process.stdout.write(reply.trim() + '\\n') })
`

export class HqControl {
  constructor(private readonly docker: Docker, private readonly container: string) {}

  /** hq's answer, or null when hq does not answer (not running, or still starting). */
  async run(command: string, args: string[] = []): Promise<HqCommandResult | null> {
    return this.answer(await this.docker.exec(this.container, ['node', '--input-type=module', '-', command, ...args], CONTROL_SCRIPT))
  }

  private answer(r: { code: number; stdout: string }): HqCommandResult | null {
    if (r.code !== 0) return null
    try {
      const value = JSON.parse(r.stdout.trim()) as HqCommandResult
      return typeof value === 'object' && value !== null && typeof value.ok === 'boolean' ? value : null
    } catch {
      return null
    }
  }

  /**
   * As `run`, with the arguments sent inside the piped program rather than on the command line: for an argument that
   * is a secret, such as a provider's key, which must not show in the process list or in Docker's record of the exec.
   */
  async runPrivately(command: string, args: string[]): Promise<HqCommandResult | null> {
    return this.answer(await this.docker.exec(this.container, ['node', '--input-type=module', '-', command], `const PRIVATE_ARGS = ${JSON.stringify(args)}\n${CONTROL_SCRIPT}`))
  }

  /** `provider add`: the key travels as `runPrivately` sends it. An empty key, name or address is none. */
  async providerAdd(p: { vendor: string; key: string; name?: string; address?: string }): Promise<HqCommandResult | null> {
    return this.runPrivately('provider', ['add', p.vendor, p.key, p.name ?? '', p.address ?? ''])
  }

  async providerList(): Promise<HqCommandResult | null> {
    return this.run('provider', ['list'])
  }

  async providerRemove(which: string): Promise<HqCommandResult | null> {
    return this.run('provider', ['remove', which])
  }

  async status(): Promise<HqStatusData | null> {
    const r = await this.run('status')
    return r?.ok && r.data ? (r.data as HqStatusData) : null
  }

  /** A link command's answer as data; null when hq does not answer, or answers without the data. */
  async link(command: 'invite-admin' | 'reset-password', args: string[] = []): Promise<HqLinkAnswer | null> {
    const r = await this.run(command, args)
    if (!r) return null
    if (!r.ok) return { ok: false, notFound: r.code === 'not_found', error: r.error }
    return isLinkData(r.data) ? { ok: true, data: r.data } : null
  }

  /** `console-code`: a one-time code for the Fleet Console on another machine (spec §7); hq keeps only its hash. */
  async consoleCode(): Promise<{ ok: true; code: string; expiresAt: string } | { ok: false; error: string } | null> {
    const r = await this.run('console-code')
    if (!r) return null
    if (!r.ok) return { ok: false, error: r.error }
    const d = r.data as { code?: unknown; expiresAt?: unknown } | undefined
    if (typeof d?.code !== 'string' || typeof d.expiresAt !== 'string' || Number.isNaN(Date.parse(d.expiresAt))) return null
    return { ok: true, code: d.code, expiresAt: d.expiresAt }
  }

  /** `fleet-admin <username>`: gives that account the fleet admin role, announced by hq (spec §7). */
  async fleetAdmin(user: string, remove = false): Promise<HqCommandResult | null> {
    return this.run('fleet-admin', remove ? ['--remove', user] : [user])
  }

  /** Tells hq why its own site is not connected, or `none` once it is; whether hq took it. */
  async reportDefaultSiteCause(cause: SiteCause | 'none'): Promise<boolean> {
    return (await this.run('default-site-cause', [cause]))?.ok === true
  }
}
