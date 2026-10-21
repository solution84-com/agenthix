/**
 * Stand-ins for the other ends: a fake hq link that records every call and envelope and lets a test send what hq
 * would, and a fake host service that holds real keys and opens and answers envelopes as a host service does.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { HostEnvelope, HostIdentity, HostMessage, ConsoleLinkMethod, ConsoleLinkMethods } from '@agenthix/core'
import {
  EnvelopeReplayGuard, fingerprintOf, generateHostKeys, hostJoinBinding, openEnvelope, sealEnvelope, type HostKeys,
} from '@agenthix/core/host-crypto'
import { HqCallError, HqUnavailableError, LinkListeners, type HandoverFrame, type HqLink, type LinkEvents, type LinkState } from '../hq/link'
import { StateFolder } from '../state/folder'

type Handler<M extends ConsoleLinkMethod> = (params: ConsoleLinkMethods[M]['params']) => ConsoleLinkMethods[M]['result'] | Promise<ConsoleLinkMethods[M]['result']>

export class FakeHqLink implements HqLink {
  state: LinkState = 'connected'
  readonly calls: { method: ConsoleLinkMethod; params: unknown }[] = []
  readonly envelopes: HostEnvelope[] = []
  readonly handoverFrames: { type: HandoverFrame; payload: unknown }[] = []
  private readonly listeners = new LinkListeners()
  private readonly handlers: Partial<{ [M in ConsoleLinkMethod]: Handler<M> }> = {
    'activity.record': () => ({ recorded: true }),
    'host.list': () => ({ hosts: [] }),
    'fleetAdmin.list': () => ({ admins: [] }),
  }

  handle<M extends ConsoleLinkMethod>(method: M, handler: Handler<M>): void {
    ;(this.handlers as Record<string, unknown>)[method] = handler
  }

  async call<M extends ConsoleLinkMethod>(method: M, params: ConsoleLinkMethods[M]['params']): Promise<ConsoleLinkMethods[M]['result']> {
    if (this.state !== 'connected') throw new HqUnavailableError()
    this.calls.push({ method, params })
    const handler = this.handlers[method] as Handler<M> | undefined
    if (!handler) throw new HqCallError('unknown_method', `No fake for ${method}`)
    return handler(params)
  }

  sendEnvelope(envelope: HostEnvelope): void {
    if (this.state !== 'connected') throw new HqUnavailableError()
    this.envelopes.push(envelope)
  }

  sendHandover(type: HandoverFrame, payload: unknown): void {
    this.handoverFrames.push({ type, payload })
  }

  on<E extends keyof LinkEvents>(event: E, listener: LinkEvents[E]): void {
    this.listeners.on(event, listener)
  }

  emit<E extends keyof LinkEvents>(event: E, ...args: Parameters<LinkEvents[E]>): void {
    this.listeners.emit(event, ...args)
  }

  setState(state: LinkState): void {
    this.state = state
    this.listeners.emit('state', state)
  }

  /** Everything the console has sent hq, as hq would see it on the wire. */
  wire(): string {
    return JSON.stringify({ calls: this.calls, envelopes: this.envelopes, handoverFrames: this.handoverFrames })
  }

  callsOf<M extends ConsoleLinkMethod>(method: M): ConsoleLinkMethods[M]['params'][] {
    return this.calls.filter(c => c.method === method).map(c => c.params as ConsoleLinkMethods[M]['params'])
  }
}

export class FakeHost {
  readonly replay = new EnvelopeReplayGuard(0)
  consoleIdentity: HostIdentity | null = null

  private constructor(readonly keys: HostKeys, readonly fingerprint: string) {}

  static async create(): Promise<FakeHost> {
    const keys = await generateHostKeys('host')
    return new FakeHost(keys, await fingerprintOf(keys.identity))
  }

  async joinRequest(joinId: string, code: string, machineName = 'office-server', claims: { runsHq?: true } = {}) {
    return { joinId, identity: this.keys.identity, machineName, ...claims, binding: await hostJoinBinding(code, this.fingerprint, claims) }
  }

  /** Opens an envelope from the console, against the console's pinned identity. */
  async open(envelope: HostEnvelope) {
    const fleetConsole = this.consoleIdentity
    if (!fleetConsole) throw new Error('The fake host has pinned no console')
    const consoleFp = await fingerprintOf(fleetConsole)
    return openEnvelope(envelope, { recipient: this.keys, pinned: fp => (fp === consoleFp ? fleetConsole : null), replay: this.replay })
  }

  seal(message: HostMessage, sender: HostKeys = this.keys): Promise<HostEnvelope> {
    if (!this.consoleIdentity) throw new Error('The fake host has pinned no console')
    return sealEnvelope({ sender, recipient: this.consoleIdentity, message })
  }
}

export function tempState(): StateFolder {
  return new StateFolder(fs.mkdtempSync(path.join(os.tmpdir(), 'console-test-')))
}

export const flush = () => new Promise(r => setTimeout(r, 0))

export async function until(check: () => boolean, ms = 2_000): Promise<void> {
  const end = Date.now() + ms
  while (!check()) {
    if (Date.now() > end) throw new Error('Timed out waiting')
    await new Promise(r => setTimeout(r, 5))
  }
}
