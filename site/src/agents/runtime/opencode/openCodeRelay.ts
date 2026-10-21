/**
 * The site's end of the relay (relayScript.ts): one long-running
 * `docker exec -i` per container, carrying every request to that container's
 * OpenCode server and its event stream (spec §1). The relay outlives the
 * server it starts; when the server stops, its event stream ends and the
 * server manager subscribes again once it has started another.
 *
 * Every request has a time limit, enforced twice: by the relay on its own
 * fetch, and here, a little later, in case the relay itself stops answering.
 * When the relay's process ends, everything waiting on it is answered with an
 * error at once.
 */
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import readline from 'node:readline'
import { AGENT_IMAGE_USER } from '../harnessHomes'
import { RELAY_SOURCE } from './relayScript'

export type RelayResponse = { status: number; body: string; error?: string }

export type RelayServerExit = { pid: number | null; code: number | null; signal: string | null; tail: string }

export interface RelayHandlers {
  /** The server the relay started has stopped, whatever the reason. */
  onServerExit(exit: RelayServerExit): void
  /** The relay itself has gone: the container stopped, or `close()` was called. */
  onClose(): void
}

export interface EventSubscription {
  /** Settles when the stream ends — the server stopped, or the relay did — with the reason, if any. */
  readonly ended: Promise<{ error?: string }>
}

/** What the server manager needs of a relay; a fake stands in for it in tests. */
export interface Relay {
  start(argv: string[], env: Record<string, string>, port: number, timeoutMs: number): Promise<{ pid: number | null }>
  stop(timeoutMs: number): Promise<void>
  request(method: string, path: string, body: unknown, timeoutMs: number): Promise<RelayResponse>
  subscribe(path: string, onEvent: (event: unknown) => void, connectTimeoutMs: number): EventSubscription
  close(): void
  readonly closed: boolean
}

/** How the relay's process is started; `docker exec` into the container by default. */
export type RelaySpawn = () => ChildProcessWithoutNullStreams

/** A relay must answer within this much of the deadline it was given, or it is taken as gone for that request. */
const HOST_GRACE_MS = 2_000

export function relayDockerArgs(containerName: string): string[] {
  return ['exec', '-i', '-u', AGENT_IMAGE_USER, containerName, 'node', '--experimental-sqlite', '--no-warnings', '-e', RELAY_SOURCE]
}

export function dockerRelaySpawn(containerName: string): RelaySpawn {
  return () => spawn('docker', relayDockerArgs(containerName), {
    env: { PATH: process.env.PATH ?? '' },
    stdio: ['pipe', 'pipe', 'pipe'],
  })
}

type Pending = { resolve: (m: Record<string, unknown>) => void; reject: (e: Error) => void; timer: NodeJS.Timeout }

export class ProcessRelay implements Relay {
  private proc: ChildProcessWithoutNullStreams
  private nextId = 1
  private pending = new Map<number, Pending>()
  private isClosing = false
  private streams = new Map<number, { onEvent: (e: unknown) => void; end: (r: { error?: string }) => void }>()
  private isClosed = false

  constructor(spawnRelay: RelaySpawn, private readonly handlers: RelayHandlers) {
    this.proc = spawnRelay()
    const lines = readline.createInterface({ input: this.proc.stdout })
    lines.on('line', line => this.onLine(line))
    this.proc.stderr.on('data', () => {})
    this.proc.stdin.on('error', () => {})
    this.proc.on('error', () => this.onGone())
    this.proc.on('close', () => this.onGone())
  }

  get closed(): boolean {
    return this.isClosed
  }

  start(argv: string[], env: Record<string, string>, port: number, timeoutMs: number): Promise<{ pid: number | null }> {
    return this.call({ op: 'start', argv, env, port }, timeoutMs).then(m => {
      if (typeof m.error === 'string') throw new Error(`The OpenCode server could not be started: ${m.error}`)
      return { pid: typeof m.pid === 'number' ? m.pid : null }
    })
  }

  async stop(timeoutMs: number): Promise<void> {
    const m = await this.call({ op: 'stop' }, timeoutMs)
    if (typeof m.error === 'string') throw new Error(`The OpenCode server could not be stopped: ${m.error}`)
  }

  async request(method: string, path: string, body: unknown, timeoutMs: number): Promise<RelayResponse> {
    const m = await this.call({ op: 'request', method, path, body, timeoutMs }, timeoutMs + HOST_GRACE_MS)
    return {
      status: typeof m.status === 'number' ? m.status : 0,
      body: typeof m.body === 'string' ? m.body : '',
      ...(typeof m.error === 'string' ? { error: m.error } : {}),
    }
  }

  subscribe(path: string, onEvent: (event: unknown) => void, connectTimeoutMs: number): EventSubscription {
    const id = this.nextId++
    const ended = new Promise<{ error?: string }>(resolve => {
      if (this.isClosed) return resolve({ error: 'the relay has stopped' })
      this.streams.set(id, { onEvent, end: resolve })
      this.send({ id, op: 'events', path, timeoutMs: connectTimeoutMs })
    })
    return { ended }
  }

  close(): void {
    if (this.isClosed || this.isClosing) return
    // Answer what is waiting now: the relay may still pass on its server's
    // dropped sockets as it stops, and a caller that closed it should not see those.
    this.isClosing = true
    this.rejectPending()
    this.proc.stdin.end()
    setTimeout(() => { if (!this.isClosed) this.proc.kill('SIGKILL') }, 10_000).unref()
  }

  private call(message: Record<string, unknown>, timeoutMs: number): Promise<Record<string, unknown>> {
    if (this.isClosed || this.isClosing) return Promise.reject(new Error('The OpenCode relay has stopped'))
    const id = this.nextId++
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`The OpenCode relay did not answer within ${timeoutMs} ms`))
      }, timeoutMs)
      this.pending.set(id, { resolve, reject, timer })
      this.send({ id, ...message })
    })
  }

  private send(message: Record<string, unknown>): void {
    this.proc.stdin.write(JSON.stringify(message) + '\n')
  }

  private onLine(line: string): void {
    let m: Record<string, unknown>
    try { m = JSON.parse(line) } catch { return }
    if (!m || typeof m !== 'object') return
    if (m.serverExit && typeof m.serverExit === 'object') {
      const e = m.serverExit as Record<string, unknown>
      this.handlers.onServerExit({
        pid: typeof e.pid === 'number' ? e.pid : null,
        code: typeof e.code === 'number' ? e.code : null,
        signal: typeof e.signal === 'string' ? e.signal : null,
        tail: typeof e.tail === 'string' ? e.tail : '',
      })
      return
    }
    const id = typeof m.id === 'number' ? m.id : -1
    const stream = this.streams.get(id)
    if (stream) {
      if ('event' in m) stream.onEvent(m.event)
      else if (m.ended) {
        this.streams.delete(id)
        stream.end(typeof m.error === 'string' ? { error: m.error } : {})
      }
      return
    }
    const waiting = this.pending.get(id)
    if (!waiting) return
    this.pending.delete(id)
    clearTimeout(waiting.timer)
    waiting.resolve(m)
  }

  private onGone(): void {
    if (this.isClosed) return
    this.isClosed = true
    this.rejectPending()
    for (const [id, s] of this.streams) {
      this.streams.delete(id)
      s.end({ error: 'the relay has stopped' })
    }
    this.handlers.onClose()
  }

  private rejectPending(): void {
    for (const [id, p] of this.pending) {
      clearTimeout(p.timer)
      p.reject(new Error('The OpenCode relay has stopped'))
      this.pending.delete(id)
    }
  }
}
