/**
 * One OpenCode server per container (spec §1, adr-0081), driven through one
 * relay (openCodeRelay.ts).
 *
 * - **Started** by the first turn dispatched to a container without one, with
 *   a password and a key of its own and no conversation's tag; never on a home
 *   holding an OpenCode account (the relay refuses), and never on a kernel
 *   whose Landlock cannot contain its commands (landlockCheck.ts).
 * - **Stopped** when the last conversation it serves goes idle or ends, and
 *   with its container: the relay's `docker exec` ends, and the relay stops
 *   the server as it goes.
 * - **Restarted** by the next turn after a crash. A restart drops every
 *   platform-tool connection, so each conversation's is added again before its
 *   next turn; the event stream is subscribed again with the new server.
 *
 * Turns route by OpenCode session id: the server's one event stream
 * (`/global/event`, every project folder's events) is fanned out to the turn
 * that owns each session. When the server stops, every running turn is told.
 */
import { randomBytes } from 'node:crypto'
import { Logger } from '../../../server/utils/logger'
import { getAgentFacingSiteUrl } from '../../../server/siteConfig'
import { requireLandlock } from '../landlockCheck'
import { dockerRelaySpawn, ProcessRelay, type Relay, type RelayHandlers, type RelayResponse } from './openCodeRelay'
import { OPENCODE_SERVE_ARGV, OPENCODE_SERVER_PORT, renderServerEnv, type CompatibleEndpoint } from './openCodeConfig'
import { OPENCODE_HARNESS, PLATFORM_TOOLS_HARNESS_HEADER } from '../../../server/mcp/siteTools'
import { forgetConversationSessions, forgetServer, registerServerKey } from './openCodeTurns'
import { openCodeEventSession, parseOpenCodeEvent, type OpenCodeEvent } from './openCodeEvents'

const logger = new Logger('OpenCodeServers')

export interface ServerDeps {
  spawnRelay(containerName: string, handlers: RelayHandlers): Relay
  checkLandlock(containerName: string): Promise<void>
  siteUrl(): string
  readyDeadlineMs: number
}

const defaultDeps: ServerDeps = {
  spawnRelay: (containerName, handlers) => new ProcessRelay(dockerRelaySpawn(containerName), handlers),
  checkLandlock: containerName => requireLandlock(containerName),
  siteUrl: getAgentFacingSiteUrl,
  readyDeadlineMs: 60_000,
}

/** What a turn hears about its session: an event, or that the server stopped under it. */
export type SessionListener = { onEvent(e: OpenCodeEvent): void; onServerStopped(reason: string): void }

/** A turn's need of the server: an OpenAI-compatible model name it must be configured for. */
export type ServerNeed = { compatibleModel?: string }

type Connection = { name: string; token: string; directory: string; generation: number }

type ServerState = {
  relay: Relay | null
  running: boolean
  generation: number
  compatible: CompatibleEndpoint | null
  lock: Promise<unknown>
  listeners: Map<string, SessionListener>
  connections: Map<string, Connection>
  live: Set<string>
  turns: number
}

const REQUEST_TIMEOUT_MS = 30_000

function satisfies(current: CompatibleEndpoint | null, need: ServerNeed | null): boolean {
  if (!need?.compatibleModel) return true
  return !!current && current.models.includes(need.compatibleModel)
}

/** A healthy server answers in 10-24 ms; a probe that connects as the port opens can otherwise hang. */
const HEALTH_PROBE_TIMEOUT_MS = 250

export class OpenCodeServers {
  private servers = new Map<string, ServerState>()

  constructor(private readonly deps: ServerDeps = defaultDeps) {}

  /** A running server for this container, started or reconfigured if it must be. Serialised per container. */
  ensureServer(containerName: string, need: ServerNeed | null): Promise<void> {
    const state = this.state(containerName)
    const run = state.lock.then(() => this.ensureLocked(containerName, state, need))
    state.lock = run.catch(() => {})
    return run
  }

  async request(containerName: string, method: string, path: string, body?: unknown, timeoutMs = REQUEST_TIMEOUT_MS): Promise<RelayResponse> {
    const state = this.servers.get(containerName)
    if (!state?.relay || !state.running) throw new Error('The OpenCode server for this conversation is not running')
    return state.relay.request(method, path, body, timeoutMs)
  }

  /** Routes a session's events to one turn; returns how to stop. */
  listen(containerName: string, openCodeSessionId: string, listener: SessionListener): () => void {
    const state = this.state(containerName)
    state.listeners.set(openCodeSessionId, listener)
    return () => { if (state.listeners.get(openCodeSessionId) === listener) state.listeners.delete(openCodeSessionId) }
  }

  /**
   * The conversation's own platform-tool connection on the running server,
   * added when missing — first turn, after a restart, or in a project folder
   * the server has not seen it in — or when its token changed.
   */
  async ensureConnection(containerName: string, conversationId: string, c: { name: string; token: string; directory: string; url: string }): Promise<void> {
    const state = this.state(containerName)
    for (const [other, conn] of state.connections) {
      if (other !== conversationId && conn.name === c.name) throw new Error('Two conversations on one OpenCode server were given the same connection name')
    }
    const current = state.connections.get(conversationId)
    if (current && current.generation === state.generation && current.token === c.token && current.directory === c.directory) return
    const res = await this.request(containerName, 'POST', `/mcp?directory=${encodeURIComponent(c.directory)}`, {
      name: c.name,
      config: { type: 'remote', url: c.url, headers: { Authorization: `Bearer ${c.token}`, [PLATFORM_TOOLS_HARNESS_HEADER]: OPENCODE_HARNESS }, oauth: false, enabled: true },
    })
    const status = res.status === 200 ? (JSON.parse(res.body) as Record<string, { status?: string; error?: string }>)[c.name] : undefined
    if (status?.status !== 'connected') {
      throw new Error(`The platform's tools could not be connected to OpenCode (${status?.error ?? status?.status ?? res.error ?? `status ${res.status}`})`)
    }
    state.connections.set(conversationId, { name: c.name, token: c.token, directory: c.directory, generation: state.generation })
  }

  turnStarted(containerName: string, conversationId: string): void {
    const state = this.state(containerName)
    state.live.add(conversationId)
    state.turns++
  }

  turnEnded(containerName: string): void {
    const state = this.state(containerName)
    state.turns = Math.max(0, state.turns - 1)
  }

  /** The conversation no longer keeps the server warm; the last one to go stops it. Never throws. */
  async releaseConversation(containerName: string, conversationId: string): Promise<void> {
    const state = this.servers.get(containerName)
    forgetConversationSessions(conversationId)
    if (!state) return
    state.live.delete(conversationId)
    const conn = state.connections.get(conversationId)
    state.connections.delete(conversationId)
    if (conn && state.running && conn.generation === state.generation) {
      await this.request(containerName, 'POST', `/mcp/${encodeURIComponent(conn.name)}/disconnect?directory=${encodeURIComponent(conn.directory)}`, undefined, 10_000)
        .catch(err => logger.warn(`[opencode] ${containerName}: could not disconnect ${conn.name}: ${String(err)}`))
    }
    if (state.live.size === 0 && state.turns === 0) await this.stop(containerName)
  }

  /** Stops the container's server when no conversation holds it — one started only to answer a question. Never throws. */
  async stopIfUnused(containerName: string): Promise<void> {
    const state = this.servers.get(containerName)
    if (state && state.live.size === 0 && state.turns === 0) await this.stop(containerName)
  }

  /** Stops the container's server and lets its relay go. Never throws. */
  async stop(containerName: string): Promise<void> {
    const state = this.servers.get(containerName)
    if (!state) return
    const run = state.lock.then(async () => {
      const relay = state.relay
      this.markStopped(containerName, state, 'the OpenCode server was stopped')
      state.relay = null
      if (relay && !relay.closed) {
        await relay.stop(15_000).catch(err => logger.warn(`[opencode] ${containerName}: stopping the server: ${String(err)}`))
        relay.close()
      }
    })
    state.lock = run.catch(() => {})
    await run.catch(() => {})
  }

  isRunning(containerName: string): boolean {
    return this.servers.get(containerName)?.running ?? false
  }

  private state(containerName: string): ServerState {
    let state = this.servers.get(containerName)
    if (!state) {
      state = { relay: null, running: false, generation: 0, compatible: null, lock: Promise.resolve(), listeners: new Map(), connections: new Map(), live: new Set(), turns: 0 }
      this.servers.set(containerName, state)
    }
    return state
  }

  private async ensureLocked(containerName: string, state: ServerState, need: ServerNeed | null): Promise<void> {
    if (state.running && state.relay && !state.relay.closed && satisfies(state.compatible, need)) return
    if (state.running) {
      if (state.turns > 0) {
        throw new Error('Another conversation is running on this container\'s OpenCode server, which must restart to add this OpenAI-compatible model; run this again when it has finished.')
      }
      await state.relay?.stop(15_000).catch(() => {})
      this.markStopped(containerName, state, 'the OpenCode server was restarted')
    }
    await this.deps.checkLandlock(containerName)
    if (!state.relay || state.relay.closed) {
      state.relay = this.deps.spawnRelay(containerName, {
        onServerExit: exit => {
          if (!state.running) return
          logger.warn(`[opencode] ${containerName}: server exited (code ${exit.code}, signal ${exit.signal}) ${exit.tail.trim().slice(-300)}`)
          this.markStopped(containerName, state, 'the OpenCode server stopped during the turn')
        },
        onClose: () => {
          this.markStopped(containerName, state, 'the OpenCode relay stopped')
          state.relay = null
        },
      })
    }
    const compatible = mergeCompatible(state.compatible, need)
    const password = randomBytes(32).toString('base64url')
    const serverKey = randomBytes(32).toString('base64url')
    const relay = state.relay
    const env = renderServerEnv({ password, serverKey, siteUrl: this.deps.siteUrl(), compatible })
    registerServerKey(containerName, serverKey)
    try {
      await relay.start([...OPENCODE_SERVE_ARGV], env, OPENCODE_SERVER_PORT, 30_000)
      await this.waitReady(relay)
    } catch (err) {
      forgetServer(containerName)
      await relay.stop(15_000).catch(() => {})
      throw err
    }
    state.compatible = compatible
    state.generation++
    state.running = true
    try {
      await this.subscribe(containerName, state, relay, state.generation)
    } catch (err) {
      this.markStopped(containerName, state, 'the OpenCode server could not be followed')
      await relay.stop(15_000).catch(() => {})
      throw err
    }
    logger.info(`[opencode] ${containerName}: server started (generation ${state.generation})`)
  }

  private async waitReady(relay: Relay): Promise<void> {
    const deadline = Date.now() + this.deps.readyDeadlineMs
    let last = ''
    while (Date.now() < deadline) {
      if (relay.closed) throw new Error('The OpenCode relay stopped while its server was starting')
      const began = Date.now()
      const res = await relay.request('GET', '/global/health', undefined, HEALTH_PROBE_TIMEOUT_MS).catch((err: unknown) => ({ status: 0, body: '', error: String(err) }))
      if (res.status === 200) return
      last = res.error ?? `status ${res.status}`
      // A probe that ran to its timeout has already waited; ask again at once.
      if (Date.now() - began < HEALTH_PROBE_TIMEOUT_MS) await new Promise(r => setTimeout(r, 150))
    }
    throw new Error(`The OpenCode server did not answer within ${this.deps.readyDeadlineMs} ms (${last})`)
  }

  /**
   * Follows the server's event stream, resolving once it is connected — its
   * first event — so no turn is sent before its events can be heard. Should the
   * stream end while the server runs, every running turn is told (its events
   * in between are lost, so waiting on it could wait forever) and the stream
   * is followed again for the turns that come after.
   */
  private subscribe(containerName: string, state: ServerState, relay: Relay, generation: number): Promise<void> {
    return new Promise((resolve, reject) => {
      let connected = false
      const timer = setTimeout(() => reject(new Error('The OpenCode server\'s event stream did not connect')), 15_000)
      const sub = relay.subscribe('/global/event', raw => {
        if (!connected) { connected = true; clearTimeout(timer); resolve() }
        this.route(state, raw)
      }, 10_000)
      void sub.ended.then(({ error }) => {
        clearTimeout(timer)
        if (!connected) return reject(new Error(`The OpenCode server's event stream did not connect (${error ?? 'closed'})`))
        if (state.generation !== generation || !state.running || relay.closed) return
        logger.warn(`[opencode] ${containerName}: event stream ended (${error ?? 'closed'}); following it again`)
        this.tellTurns(state, 'the OpenCode event stream was interrupted')
        setTimeout(() => {
          if (state.generation !== generation || !state.running || relay.closed) return
          this.subscribe(containerName, state, relay, generation).catch(err => logger.warn(`[opencode] ${containerName}: ${String(err)}`))
        }, 250)
      })
    })
  }

  private tellTurns(state: ServerState, reason: string): void {
    for (const listener of [...state.listeners.values()]) listener.onServerStopped(reason)
  }

  private route(state: ServerState, raw: unknown): void {
    const payload = raw && typeof raw === 'object' ? (raw as { payload?: unknown }).payload : undefined
    const event = parseOpenCodeEvent(payload)
    if (!event) return
    if (event.type === 'server.instance.disposed') {
      const directory = (raw as { directory?: unknown }).directory
      for (const [id, conn] of state.connections) if (conn.directory === directory) state.connections.delete(id)
      return
    }
    const sessionId = openCodeEventSession(event)
    if (sessionId) state.listeners.get(sessionId)?.onEvent(event)
  }

  private markStopped(containerName: string, state: ServerState, reason: string): void {
    const wasRunning = state.running
    state.running = false
    state.connections.clear()
    forgetServer(containerName)
    if (wasRunning) this.tellTurns(state, reason)
  }
}

function mergeCompatible(current: CompatibleEndpoint | null, need: ServerNeed | null): CompatibleEndpoint | null {
  if (!need?.compatibleModel) return current
  return { models: [...new Set([...(current?.models ?? []), need.compatibleModel])] }
}

export const openCodeServers = new OpenCodeServers()
