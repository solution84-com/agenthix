// A stand-in Fleet Console and a stand-in host service, written with core's own
// host cryptography and no Docker, so the cross-app tier can add a site the
// way the product does (host-management spec §6, *Connecting a machine*):
//
//   1. the console dials /console-link with HQ_CONSOLE_PAIRING_SECRET and opens
//      a join with the lookup derived from a one-time code;
//   2. the host dials /host-link with that lookup and sends its half of the
//      join, bound to the code;
//   3. the console checks the binding and accepts with its own; hq hands the
//      machine its credential, and the joining connection carries on as the
//      host's link;
//   4. the console sends a signed, sealed `install` of the site; the host makes
//      the site's credential and answers only its hash;
//   5. the console registers that hash with `site.register`, and the real site
//      is started with the credential.
//
// Each test file runs in its own process, so what a later file needs — the
// keys, the ids, the credentials — is kept in a file under the run's temp dir,
// as the real programs keep theirs in their state folders.
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  EnvelopeReplayGuard, fingerprintOf, generateHostKeys, generateJoinCode, hostJoinBinding, joinLookup,
  consoleJoinBinding, openEnvelope, sealEnvelope, verifyHostJoinBinding, verifyConsoleJoinBinding, type HostKeys,
} from '../../../core/dist/host/crypto/index.js'
import {
  HOST_JOIN_LOOKUP_HEADER, HQ_HOST_LINK_PATH, HQ_CONSOLE_LINK_PATH,
  type HostEnvelope, type HostIdentity, type HostMessage, type HostRequest, type HostResult,
} from '../../../core/dist/index.js'
import { CONSOLE_PAIRING_SECRET, SITE_ROOT_DIR } from './env'
import { RelayLink } from './relayLink'

const ACTOR = { kind: 'fleetAdmin' as const, userId: 'cross-app-fleet-admin', name: 'Cross-App Fleet Admin' }

/**
 * A replay guard refuses everything sent before it began, plus the allowed clock skew (core's replay.ts). These
 * stand-ins start and send within the same second, and have no earlier envelopes to forget, so theirs begins earlier.
 */
const freshGuard = () => new EnvelopeReplayGuard(Date.now() - 60_000)

// `any`: as `call` below.
export type ConsoleAnswer = { ok: true; result: any } | { ok: false; code: string; message: string }

export class StandInConsole {
  private readonly replay = freshGuard()

  private constructor(readonly keys: HostKeys, readonly link: RelayLink) {}

  static async connect(keys?: HostKeys, secret = CONSOLE_PAIRING_SECRET): Promise<StandInConsole> {
    const link = await RelayLink.dial(HQ_CONSOLE_LINK_PATH, { Authorization: `Bearer ${secret}` })
    return new StandInConsole(keys ?? (await generateHostKeys('console')), link)
  }

  fingerprint(): Promise<string> {
    return fingerprintOf(this.keys.identity)
  }

  /** One of core's `ConsoleLinkMethods`, answered as hq answers it. */
  async ask(method: string, params: unknown): Promise<ConsoleAnswer> {
    const requestId = randomUUID()
    this.link.send('console.request', { method, params }, { requestId })
    const f = await this.link.next(['console.response', 'console.error'], r => r.replyTo === requestId)
    return f.type === 'console.response' ? { ok: true, result: f.payload } : { ok: false, ...f.payload }
  }

  // `any`: each method's result has its own shape (core's ConsoleLinkMethods); callers read the fields they need.
  async call(method: string, params: unknown): Promise<any> {
    const answer = await this.ask(method, params)
    if (!answer.ok) throw new Error(`${method} refused: ${answer.code} — ${answer.message}`)
    return answer.result
  }

  /** Step 1: a one-time code, of which hq is given only the lookup. */
  async openJoin(): Promise<{ code: string; joinId: string }> {
    const code = generateJoinCode()
    const expiresAt = new Date(Date.now() + 60 * 60_000).toISOString()
    const { joinId } = await this.call('join.open', { lookup: await joinLookup(code), expiresAt, purpose: { kind: 'add' } })
    return { code, joinId }
  }

  /** Step 3: the machine's half is checked against the code, then accepted with the console's own binding. */
  async confirmJoin(joinId: string, code: string): Promise<{ hostId: string; host: HostIdentity }> {
    const request = await this.link.next('join.request', f => f.payload.joinId === joinId)
    const host: HostIdentity = request.payload.identity
    const hostFp = await fingerprintOf(host)
    if (!(await verifyHostJoinBinding(code, hostFp, request.payload.binding))) {
      throw new Error('the joining machine did not prove it holds the code')
    }
    const binding = await consoleJoinBinding(code, await this.fingerprint(), hostFp)
    const { hostId } = await this.call('join.accept', { joinId, acceptance: { identity: this.keys.identity, binding } })
    return { hostId, host }
  }

  async seal(host: HostIdentity, message: HostMessage): Promise<HostEnvelope> {
    return sealEnvelope({ sender: this.keys, recipient: host, message })
  }

  /** A signed, sealed request to a host, and its sealed answer. */
  async command(host: HostIdentity, request: HostRequest): Promise<HostResult> {
    const requestId = randomUUID()
    const envelope = await this.seal(host, { kind: 'request', requestId, by: ACTOR, request })
    this.link.send('relay.envelope', { envelope })
    const hostFp = await fingerprintOf(host)
    const back = await this.link.next('relay.envelope', f => f.payload.envelope.from === hostFp)
    const opened = await this.open(back.payload.envelope, host)
    const message = opened as Extract<HostMessage, { kind: 'result' }>
    if (message.kind !== 'result' || message.replyTo !== requestId) throw new Error('the host answered something else')
    return message.result
  }

  async open(envelope: unknown, from: HostIdentity): Promise<unknown> {
    const fromFp = await fingerprintOf(from)
    const opened = await openEnvelope(envelope, {
      recipient: this.keys, pinned: fp => (fp === fromFp ? from : null), replay: this.replay,
    })
    if (!opened.ok) throw new Error(`the console refused an envelope: ${opened.reason}`)
    return opened.message
  }

  close(): void {
    this.link.close()
  }
}

export class StandInHost {
  private readonly replay = freshGuard()
  link: RelayLink | null = null
  hostId: string | null = null
  machineCredential: string | null = null
  console: HostIdentity | null = null

  constructor(readonly keys: HostKeys, readonly machineName: string) {}

  static async create(machineName: string): Promise<StandInHost> {
    return new StandInHost(await generateHostKeys('host'), machineName)
  }

  /** The machine as an earlier test file joined it, from what it kept. */
  static restore(m: JoinedMachine): StandInHost {
    const host = new StandInHost(m.hostKeys, m.machineName)
    Object.assign(host, { hostId: m.hostId, machineCredential: m.machineCredential, console: m.consoleKeys.identity })
    return host
  }

  fingerprint(): Promise<string> {
    return fingerprintOf(this.keys.identity)
  }

  /** Step 2, and the end of step 3: dial with the lookup, send its half, receive the credential and pin the console. */
  async join(code: string): Promise<void> {
    const lookup = await joinLookup(code)
    const link = await RelayLink.dial(HQ_HOST_LINK_PATH, { [HOST_JOIN_LOOKUP_HEADER]: lookup })
    const fp = await this.fingerprint()
    link.send('host.join', { lookup, identity: this.keys.identity, machineName: this.machineName, binding: await hostJoinBinding(code, fp) })
    const joined = await link.next(['host.joined', 'host.joinRefused'])
    if (joined.type !== 'host.joined') throw new Error(`the join was refused: ${joined.payload.reason}`)
    const { hostId, machineCredential, acceptance } = joined.payload
    if (!(await verifyConsoleJoinBinding(code, await fingerprintOf(acceptance.identity), fp, acceptance.binding))) {
      throw new Error('the console did not prove it holds the code')
    }
    Object.assign(this, { link, hostId, machineCredential, console: acceptance.identity })
  }

  /** The machine credential, as on every later start. */
  async connect(): Promise<RelayLink> {
    this.link = await RelayLink.dial(HQ_HOST_LINK_PATH, { Authorization: `Bearer ${this.machineCredential}` })
    return this.link
  }

  /** The next envelope hq passed from the pinned console, as it arrived, and the request it opened to. */
  async nextRequest(): Promise<{ envelope: HostEnvelope; message: Extract<HostMessage, { kind: 'request' }> }> {
    const consoleFp = await fingerprintOf(this.console!)
    const f = await this.link!.next('relay.envelope', r => r.payload.envelope.from === consoleFp)
    const opened = await openEnvelope(f.payload.envelope, {
      recipient: this.keys, pinned: fp => (fp === consoleFp ? this.console : null), replay: this.replay,
    })
    if (!opened.ok) throw new Error(`the host refused an envelope: ${opened.reason}`)
    return { envelope: f.payload.envelope, message: opened.message as Extract<HostMessage, { kind: 'request' }> }
  }

  async answer(replyTo: string, result: HostResult): Promise<void> {
    const envelope = await sealEnvelope({ sender: this.keys, recipient: this.console!, message: { kind: 'result', replyTo, result } })
    this.link!.send('relay.envelope', { envelope })
  }

  /** Step 4, the host's side: the site's credential is made here and only its hash answered. */
  async serveSiteInstall(): Promise<string> {
    const { message } = await this.nextRequest()
    if (message.request.op !== 'install' || message.request.target !== 'site') throw new Error(`expected an install, got ${message.request.op}`)
    const credential = randomBytes(32).toString('hex')
    const credentialHash = createHash('sha256').update(credential).digest('hex')
    await this.answer(message.requestId, { ok: true, op: 'install', result: { state: 'started', credentialHash } })
    return credential
  }
}

/** What a later test file needs of a machine joined in an earlier one. */
export type JoinedMachine = {
  consoleKeys: HostKeys
  hostKeys: HostKeys
  machineName: string
  hostId: string
  machineCredential: string
  siteCredential: string
  executionSiteId: string
}

const statePath = () => join(SITE_ROOT_DIR, 'fleet.json')

export function saveJoinedMachine(machine: JoinedMachine): void {
  writeFileSync(statePath(), JSON.stringify(machine), { mode: 0o600 })
}

export function loadJoinedMachine(): JoinedMachine {
  return JSON.parse(readFileSync(statePath(), 'utf8'))
}

/** Steps 1–3: the machine joined, each side pinning the other; the host's link is open. */
export async function joinMachine(fleetConsole: StandInConsole, host: StandInHost): Promise<{ hostId: string; identity: HostIdentity }> {
  const { code, joinId } = await fleetConsole.openJoin()
  const joining = host.join(code)
  const { hostId, host: identity } = await fleetConsole.confirmJoin(joinId, code)
  await joining
  if (hostId !== host.hostId) throw new Error('hq named the machine differently to each side')
  return { hostId, identity }
}

/** Steps 1–5 short of starting the site: the machine joined, its site installed and registered with hq, named after the machine. */
export async function addSiteThroughFleetConsole(fleetConsole: StandInConsole, host: StandInHost): Promise<JoinedMachine> {
  const { hostId, identity } = await joinMachine(fleetConsole, host)

  const serving = host.serveSiteInstall()
  const result = await fleetConsole.command(identity, { op: 'install', target: 'site', version: '0.0.0' })
  const siteCredential = await serving
  // As the real Fleet Console reads it (console/src/join/installSite.ts): an install's result for a site carries the hash.
  const credentialHash = result.ok ? (result.result as { credentialHash?: string }).credentialHash : undefined
  if (!credentialHash) throw new Error('the install did not give a credential hash')
  const { executionSiteId } = await fleetConsole.call('site.register', { hostId, credentialHash })
  return {
    consoleKeys: fleetConsole.keys, hostKeys: host.keys, machineName: host.machineName, hostId,
    machineCredential: host.machineCredential!, siteCredential, executionSiteId,
  }
}
