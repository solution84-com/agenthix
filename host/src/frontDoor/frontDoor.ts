/**
 * `front-door on | off` (host-management spec §6; the CLI board's *front-door*): the host service runs the front
 * door itself, after the person has been told it takes ports 80 and 443. Refused while either port is taken. Its
 * configuration is checked before anything changes, its certificates are checked once it runs, and anything that
 * fails puts the machine back as it was.
 */
import { FRONT_DOOR_PORTS } from '@agenthix/core'
import { installationOf } from '../state/installation'
import fs from 'node:fs'
import type { FrontDoorFigures } from '@agenthix/core'
import type { Progress } from '../sockets/lineServer'
import { composeJson, hqProject } from '../compose/projects'
import { fetchImages } from '../images/images'
import { installSecrets } from '../state/secrets'
import { installed, type Context, type StoredHq } from '../service/context'
import { Refusal } from '../owner/results'
import { cmd } from '../cli/words'
import {
  caddyfile, FRONT_DOOR_FILES, FRONT_DOOR_IMAGE, frontDoorCompose, frontDoorHosts, frontDoorProject, GIVEN_FILES, hostNameProblem, hostOf,
  type FrontDoorSettings,
} from './config'
import { givenCertificateProblem, readGivenCertificate, writeGiven, type GivenCertificate } from './given'
import { machineProbes, type FrontDoorProbes } from './probes'
import { installSubnets } from '../compose/subnets'
import { EVERY_ADDRESS, portProblems } from '../install/portCheck'

/** How long a certificate may take: the certificate authority checks the host name over port 80 first. */
const CERTIFICATE_WAIT_MS = 3 * 60_000
const CERTIFICATE_POLL_MS = 5_000
/** A certificate this close to expiry has failed to renew. Caddy renews a month ahead. */
const RENEWAL_LATE_MS = 14 * 24 * 3600_000

const probes = (ctx: Context): FrontDoorProbes => ctx.frontDoorProbes ?? machineProbes

export function frontDoorSettings(ctx: Context): FrontDoorSettings | null {
  return ctx.state.readJson('front-door', 'settings.json') as FrontDoorSettings | null
}

/** What `front-door` reads before it asks anything: what it would serve, and what stands in its way. */
export type FrontDoorCheck = {
  on: boolean
  address: string | null
  /** Where hq-web listens on the machine, for a web server of the machine's own. */
  listen: { bind: string; port: number } | null
  filesHost: string | null
  /** Why the front door cannot serve HQ at its address; null when it can. */
  problem: string | null
  busyPorts: number[]
  /** Who holds each of them, in the check's words (install/portCheck.ts). */
  busy: { port: number; what: string }[]
  /** Why turning it on would be refused, in the words the refusal says; null when it would go ahead. */
  refusal: { code: 'not_installed' | 'conflict' | 'malformed'; message: string } | null
}

function whyNot(hq: StoredHq | undefined): string | null {
  if (!hq) return null
  const host = hostOf(hq.address)
  if (!hq.address.startsWith('https://')) {
    return `HQ's address, ${hq.address}, is plain http. The front door serves HQ over https, with certificates, so it needs an https address with a host name.`
  }
  const problem = hostNameProblem(host)
  return problem ? `HQ's address, ${hq.address}, cannot have a certificate: ${problem}.` : null
}

export async function frontDoorCheck(ctx: Context, requestedFiles?: string, given = false): Promise<FrontDoorCheck> {
  const here = installed(ctx).hq
  const hq = here?.settings
  const on = frontDoorSettings(ctx)?.on === true
  const busy = hq && !on
    ? (await portProblems(ctx, FRONT_DOOR_PORTS.map(port => ({ port, part: 'front-door' as const, bind: EVERY_ADDRESS })))).map(p => ({ port: p.port, what: p.what }))
    : []
  const busyPorts = busy.map(b => b.port)
  const filesHost = hq ? requestedFiles?.toLowerCase() ?? (given ? keptGivenHost(ctx) : defaultFilesHost(hq)) : null
  const problem = whyNot(hq)
  const check: FrontDoorCheck = {
    on, address: hq?.address ?? null, listen: hq && here.port !== null ? { bind: hq.bind, port: here.port } : null, filesHost, problem, busyPorts, busy, refusal: null,
  }
  check.refusal = refusalOf(ctx, check, given)
  return check
}

function refusalOf(ctx: Context, c: FrontDoorCheck, given: boolean): FrontDoorCheck['refusal'] {
  const machine = ctx.machine.name
  if (!c.address || !c.listen) return { code: 'not_installed', message: `No HQ here: the front door serves HQ, and ${machine} runs none.` }
  if (c.problem) return { code: 'conflict', message: `${c.problem} Nothing changed.` }
  // With a certificate given and no files host, uploads are downloads only (ADR-0114): there is no host to check.
  const filesProblem = !c.filesHost ? (given ? null : 'it has none')
    : c.filesHost === hostOf(c.address) ? "it is HQ's own host, and uploaded files need one of their own" : hostNameProblem(c.filesHost)
  if (filesProblem) return { code: 'malformed', message: `Uploaded files cannot be at ${c.filesHost}: ${filesProblem}. Nothing changed.` }
  if (c.busy.length === 0) return null
  return {
    code: 'conflict',
    message: `Refused on ${machine}: ${c.busy.map(b => b.what).join(' ')} Free ${c.busy.length === 1 ? 'it' : 'them'} first — or, if it is a web ` +
      `server of your own, keep it and point it at HQ on ${c.listen.bind}:${c.listen.port}: ${cmd('front-door')} prints the steps. Nothing was changed.`,
  }
}

function keptGivenHost(ctx: Context): string | null {
  const origin = frontDoorSettings(ctx)?.given?.filesOrigin
  return origin ? hostOf(origin) : null
}

function defaultFilesHost(hq: StoredHq): string | null {
  if (hq.filesOrigin) return hostOf(hq.filesOrigin)
  return hq.address.startsWith('https://') ? `files.${hostOf(hq.address)}` : null
}

async function step<T>(progress: (p: Progress) => void, name: string, run: () => Promise<{ value: T; outcome: string }>): Promise<T> {
  progress({ event: 'step', step: name })
  try {
    const { value, outcome } = await run()
    progress({ event: 'stepDone', outcome })
    return value
  } catch (err) {
    progress({ event: 'stepDone', outcome: 'fails' })
    throw err
  }
}

/** Reads every file a change may write, so a failure can put each back as it was, or remove it. */
function snapshot(ctx: Context): [string[], string | null][] {
  const files = [
    ...FRONT_DOOR_FILES.map(f => ['front-door', f]), [...GIVEN_FILES.certificate], [...GIVEN_FILES.privateKey],
    ['hq', 'settings.json'], ['hq', 'compose.json'],
  ]
  return files.map(parts => {
    try {
      return [parts, fs.readFileSync(ctx.state.path(...parts), 'utf8')]
    } catch {
      return [parts, null]
    }
  })
}

function restore(ctx: Context, kept: [string[], string | null][]): void {
  for (const [parts, value] of kept) {
    if (value === null) fs.rmSync(ctx.state.path(...parts), { force: true })
    else ctx.state.writePrivate(parts, value)
  }
}

let busy = false

export async function frontDoorOn(ctx: Context, filesHost: string | undefined, progress: (p: Progress) => void, given?: GivenCertificate): Promise<{ on: true }> {
  if (busy) throw new Refusal('busy', 'The front door is already being changed on this machine. Wait for it to finish.')
  busy = true
  try {
    return await turnOn(ctx, filesHost, progress, given)
  } finally {
    busy = false
  }
}

async function turnOn(ctx: Context, requestedFiles: string | undefined, progress: (p: Progress) => void, given?: GivenCertificate): Promise<{ on: true }> {
  const check = await frontDoorCheck(ctx, requestedFiles, given !== undefined)
  if (check.refusal) throw new Refusal(check.refusal.code, check.refusal.message)
  const found = installed(ctx).hq!
  const hq = found.settings
  const hqHost = hostOf(hq.address)
  const filesHost = check.filesHost

  const hosts = filesHost ? [hqHost, filesHost] : [hqHost]
  if (given) {
    const problem = givenCertificateProblem(given, hosts, ctx.now())
    if (problem) throw new Refusal('malformed', `${problem} Nothing changed.`)
  }
  const config = caddyfile(ctx.names, hosts, given !== undefined)
  await step(progress, 'Checking the configuration', async () => {
    // hq-web is Caddy too: it checks the front door's configuration before anything is written or started. It does not
    // hold a given certificate, so what it checks is the configuration without the line that names it.
    const r = await ctx.docker.exec(ctx.names.container('hq-web'), ['caddy', 'validate', '--config', '/dev/stdin', '--adapter', 'caddyfile'], caddyfile(ctx.names, hosts))
    if (r.code !== 0) {
      const why = (r.stderr || r.stdout).trim().split('\n').pop() ?? ''
      throw new Refusal('failed', `The front door's configuration does not pass Caddy's check${why ? ` (${why})` : ''}. Nothing changed.`)
    }
    return { value: undefined, outcome: 'passes' }
  })
  if (!(await ctx.docker.imageExists(FRONT_DOOR_IMAGE))) {
    await step(progress, "Fetching the front door's image", async () => {
      await fetchImages(ctx, [FRONT_DOOR_IMAGE])
      return { value: undefined, outcome: 'done' }
    })
  }
  const paths = await ctx.machinePaths()
  if (!paths) throw new Refusal('failed', 'The host service cannot find its state folder on this machine. Nothing changed.')

  const before = frontDoorSettings(ctx)
  const kept = snapshot(ctx)
  const filesOrigin = filesHost ? `https://${filesHost}` : null
  const hqChanged = (hq.filesOrigin ?? null) !== filesOrigin
  const project = frontDoorProject(ctx.names)
  const file = ctx.state.path('front-door', 'compose.json')
  const rollBack = async (why: string): Promise<never> => {
    // Stopped by the project just written, before it is put back: once its file is gone, compose cannot find it.
    await ctx.docker.composeStop(project, file).catch(() => {})
    restore(ctx, kept)
    if (hqChanged) await ctx.docker.composeUp(found.project, found.file).catch(() => {})
    if (before?.on) await ctx.docker.composeUp(project, file).catch(() => {})
    const now = before?.on ? 'The front door is back as it was' : 'The front door is off, ports 80 and 443 are free again'
    throw new Refusal('failed', `Rolled back. ${now}, and HQ is as it was. ${why}`)
  }

  if (hqChanged) {
    const next: StoredHq = { ...hq, filesOrigin }
    ctx.state.writeJson(['hq', 'settings.json'], next)
    ctx.state.writePrivate(['hq', 'compose.json'], composeJson(hqProject(ctx.names, next, installSecrets(ctx.state), ctx.machine.name, await installSubnets(ctx), installationOf(ctx.state))))
  }
  ctx.state.writePrivate(['front-door', 'Caddyfile'], config)
  if (given) writeGiven(ctx.state, given)
  ctx.state.writePrivate(['front-door', 'compose.json'], composeJson(frontDoorCompose(ctx.names, paths, config, installationOf(ctx.state), given?.certificate)))
  const settings: FrontDoorSettings = { on: true, hosts, since: ctx.now().toISOString(), ...(given ? { given: { filesOrigin } } : {}) }
  ctx.state.writeJson(['front-door', 'settings.json'], settings)

  try {
    if (hqChanged) {
      await step(progress, filesHost ? `Giving uploaded files their address, ${filesHost}` : 'Serving uploaded files as downloads only', async () => {
        await ctx.docker.composeUp(found.project, found.file)
        return { value: undefined, outcome: 'done' }
      })
    }
    await step(progress, 'Starting the front door on ports 80 and 443', async () => {
      await ctx.docker.composeUp(project, file)
      return { value: undefined, outcome: 'started' }
    })
  } catch {
    return rollBack('The front door did not start; nothing else on this machine was changed.')
  }

  for (const host of hosts) {
    const cert = await step(progress, `Certificate for ${host}`, async () => {
      const got = await waitForCertificate(ctx, host, given?.certificate)
      return { value: got, outcome: got.ok ? 'obtained' : 'fails' }
    })
    if (!cert.ok) {
      progress({
        event: 'note',
        text: `${host} does not answer here with a certificate (${cert.problem}). Check that it points at ${ctx.machine.name} and that ports 80 and 443 reach ${ctx.machine.name} from the internet.`,
      })
      return rollBack(`Point ${host} at ${ctx.machine.name}, then run this again.`)
    }
  }
  return { on: true }
}

async function waitForCertificate(ctx: Context, host: string, given?: string) {
  const until = ctx.now().getTime() + CERTIFICATE_WAIT_MS
  for (;;) {
    const got = await probes(ctx).certificate(host, given)
    if (got.ok || ctx.now().getTime() >= until) return got
    await ctx.sleep(CERTIFICATE_POLL_MS)
  }
}

export async function frontDoorOff(ctx: Context): Promise<{ on: false }> {
  const settings = frontDoorSettings(ctx)
  if (!settings?.on) return { on: false }
  await ctx.docker.composeStop(frontDoorProject(ctx.names), ctx.state.path('front-door', 'compose.json'))
  ctx.state.writeJson(['front-door', 'settings.json'], { ...settings, on: false, since: ctx.now().toISOString() })
  return { on: false }
}

/** The front door among the machine's figures (spec §6): on or off, its earliest certificate expiry, and any renewal problem. */
export async function frontDoorFigures(ctx: Context): Promise<FrontDoorFigures> {
  const settings = frontDoorSettings(ctx)
  if (!settings?.on) return { on: false, certificateExpiresAt: null, renewalProblem: null }
  let earliest: string | null = null
  const problems: string[] = []
  const given = readGivenCertificate(ctx.state) ?? undefined
  for (const host of settings.hosts) {
    const got = await probes(ctx).certificate(host, given)
    if (!got.ok) {
      problems.push(`${host}: ${got.problem}`)
      continue
    }
    if (!earliest || got.expiresAt < earliest) earliest = got.expiresAt
    if (Date.parse(got.expiresAt) - ctx.now().getTime() < RENEWAL_LATE_MS) problems.push(`${host}: its certificate expires on ${got.expiresAt.slice(0, 10)} and has not renewed`)
  }
  return { on: true, certificateExpiresAt: earliest, renewalProblem: problems.length ? problems.join('; ') : null }
}
