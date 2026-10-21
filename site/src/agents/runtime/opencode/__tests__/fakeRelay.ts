/**
 * A stand-in for the relay and the OpenCode server behind it, for the unit
 * tests: requests are answered by a handler the test sets, events are pushed
 * by the test, and the server can be made to crash.
 */
import type { Relay, RelayHandlers, RelayResponse, EventSubscription } from '../openCodeRelay'
import type { ServerDeps } from '../openCodeServers'

export type Call = { method: string; path: string; body: unknown }

export class FakeRelay implements Relay {
  calls: Call[] = []
  starts: Array<{ argv: string[]; env: Record<string, string>; port: number }> = []
  stops = 0
  closed = false
  startError: Error | null = null
  healthyAfter = 0
  /** The first health probe gets no answer until its own timeout aborts it. */
  hangFirstHealth = false
  healthTimeouts: number[] = []
  connectOnSubscribe = true
  private subscribers: Array<{ onEvent: (e: unknown) => void; end: (r: { error?: string }) => void }> = []
  private healthPolls = 0

  constructor(private readonly handlers: RelayHandlers, public handle: (c: Call) => RelayResponse | undefined) {}

  async start(argv: string[], env: Record<string, string>, port: number): Promise<{ pid: number | null }> {
    if (this.startError) throw this.startError
    this.starts.push({ argv, env, port })
    this.healthPolls = 0
    return { pid: 100 + this.starts.length }
  }

  async stop(): Promise<void> {
    this.stops++
    this.endStreams()
  }

  async request(method: string, path: string, body: unknown, timeoutMs = 0): Promise<RelayResponse> {
    if (this.closed) throw new Error('The OpenCode relay has stopped')
    if (path === '/global/health') {
      this.healthPolls++
      this.healthTimeouts.push(timeoutMs)
      if (this.hangFirstHealth && this.healthPolls === 1) {
        await new Promise(r => setTimeout(r, timeoutMs))
        return { status: 0, body: '', error: 'AbortError' }
      }
      return this.healthPolls > this.healthyAfter ? { status: 200, body: 'true' } : { status: 0, body: '', error: 'ECONNREFUSED' }
    }
    this.calls.push({ method, path, body })
    return this.handle({ method, path, body }) ?? { status: 404, body: '' }
  }

  subscribe(_path: string, onEvent: (e: unknown) => void): EventSubscription {
    let end!: (r: { error?: string }) => void
    const ended = new Promise<{ error?: string }>(resolve => { end = resolve })
    const sub = { onEvent, end }
    this.subscribers.push(sub)
    if (this.connectOnSubscribe) queueMicrotask(() => onEvent({ payload: { type: 'server.connected', properties: {} } }))
    return { ended }
  }

  close(): void {
    this.closed = true
    this.endStreams()
    this.handlers.onClose()
  }

  /** An event on the server's stream, as `/global/event` wraps it. */
  emit(payload: unknown, directory = '/projects/p1'): void {
    for (const s of this.subscribers) s.onEvent({ directory, payload })
  }

  /** The stream ends while the server keeps running. */
  dropStream(): void {
    this.endStreams()
  }

  crash(): void {
    this.endStreams()
    this.handlers.onServerExit({ pid: 101, code: null, signal: 'SIGKILL', tail: '' })
  }

  get subscriberCount(): number {
    return this.subscribers.length
  }

  private endStreams(): void {
    const subs = this.subscribers
    this.subscribers = []
    for (const s of subs) s.end({ error: 'ECONNRESET' })
  }
}

export function fakeDeps(
  handle: (c: Call) => RelayResponse | undefined,
  opts: { landlock?: () => Promise<void>; healthyAfter?: number; startError?: Error; neverConnects?: boolean; hangFirstHealth?: boolean } = {},
) {
  const relays: FakeRelay[] = []
  const deps: ServerDeps = {
    spawnRelay: (_containerName, handlers) => {
      const r = new FakeRelay(handlers, c => handle(c))
      r.healthyAfter = opts.healthyAfter ?? 0
      r.hangFirstHealth = opts.hangFirstHealth ?? false
      r.startError = opts.startError ?? null
      r.connectOnSubscribe = !opts.neverConnects
      relays.push(r)
      return r
    },
    checkLandlock: opts.landlock ?? (async () => {}),
    siteUrl: () => 'http://host.docker.internal:4201',
    readyDeadlineMs: 2_000,
  }
  return { deps, relays }
}

export const json = (status: number, body: unknown): RelayResponse => ({ status, body: JSON.stringify(body) })
