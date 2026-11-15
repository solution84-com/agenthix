/**
 * The site's end of a live preview's app forwarder (`appForwarderScript.ts`): one long-lived `docker exec` per live
 * preview, started when its first app stream comes, carrying every stream after it. Each stream is a `Duplex` the
 * proxy reads and writes as it would a socket. The forwarder's process id is held for the guard for its life, and the
 * forwarder ends with its live preview's pause or stop, or with its container.
 *
 * Nothing the forwarder sends is trusted beyond its own stream: a frame for a stream the site did not open, a frame
 * too long, or bytes beyond the credit it was given end the forwarder, and every stream on it with it.
 */
import { Duplex } from 'node:stream'
import { readRelayPid, type Spawner } from './appConnect'
import { FORWARD_MAX_FRAME, FORWARD_WINDOW, FRAME } from './appForwarderScript'
import type { PreviewSpawned } from '../container/exec'

/** How long a stream waits for the forwarder to connect it to the app. */
export const FORWARD_OPEN_MS = 10_000

/** The app did not answer on its port: the stream fails, and no other path is tried. */
export class AppDidNotAnswer extends Error {}

type Stream = {
  socket: Duplex
  opened: boolean
  onOpen: { resolve: () => void; reject: (e: Error) => void } | null
  /** Bytes sent to the forwarder and not yet credited, and writes waiting for credit. */
  out: number
  waiting: Array<() => void>
  /** Bytes from the forwarder pushed and not yet credited back. */
  taken: number
  given: number
  remoteDone: boolean
  eof: boolean
}

function head(type: number, id: number, length: number): Buffer {
  const h = Buffer.alloc(9)
  h[0] = type
  h.writeUInt32BE(id, 1)
  h.writeUInt32BE(length, 5)
  return h
}

const u32 = (n: number) => { const b = Buffer.alloc(4); b.writeUInt32BE(n); return b }

export class ForwarderLink {
  private readonly streams = new Map<number, Stream>()
  private nextId = 1
  private buf: Buffer = Buffer.alloc(0)
  private dead = false
  private helloSeen: (ok: boolean) => void = () => {}
  readonly ready: Promise<boolean>
  readonly pid: Promise<number | null>
  readonly exited: Promise<number>

  constructor(private readonly proc: PreviewSpawned) {
    this.pid = readRelayPid(proc.stderr)
    this.ready = new Promise(resolve => { this.helloSeen = resolve })
    proc.stdout?.on('data', (d: Buffer) => this.onData(d))
    proc.stdin?.on('error', () => this.end())
    this.exited = proc.exited.then(code => { this.end(); this.helloSeen(false); return code })
  }

  get alive(): boolean { return !this.dead }
  get openStreams(): number { return this.streams.size }

  /** A stream to the app's port; refused with `AppDidNotAnswer` when nothing listens there. */
  open(port: number): Promise<Duplex> {
    if (this.dead) return Promise.reject(new Error('The app forwarder has ended.'))
    const id = this.nextId++
    const stream = this.stream(id)
    this.streams.set(id, stream)
    const opened = new Promise<void>((resolve, reject) => { stream.onOpen = { resolve, reject } })
    const port16 = Buffer.alloc(2)
    port16.writeUInt16BE(port)
    this.send(FRAME.open, id, port16)
    let timer: ReturnType<typeof setTimeout> | undefined
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new AppDidNotAnswer(`The app did not answer within ${FORWARD_OPEN_MS} ms.`)), FORWARD_OPEN_MS)
    })
    return Promise.race([opened, timeout]).then(
      () => { clearTimeout(timer); return stream.socket },
      err => { clearTimeout(timer); this.drop(id, true); throw err },
    )
  }

  /** Ends the forwarder and every stream on it. */
  end(): void {
    if (this.dead) return
    this.dead = true
    for (const [id] of this.streams) this.drop(id, false, new Error('The app forwarder ended.'))
    this.proc.detach()
  }

  private stream(id: number): Stream {
    const link = this
    const s: Stream = { socket: null as unknown as Duplex, opened: false, onOpen: null, out: 0, waiting: [], taken: 0, given: 0, remoteDone: false, eof: false }
    s.socket = new Duplex({
      read() { link.credit(id, s) },
      write(chunk: Buffer, _enc, cb) { link.write(id, s, chunk).then(() => cb(), err => cb(err)) },
      final(cb) { if (!s.remoteDone) link.send(FRAME.end, id); cb() },
      destroy(err, cb) { link.drop(id, true); cb(err) },
    })
    return s
  }

  private async write(id: number, s: Stream, chunk: Buffer): Promise<void> {
    for (let at = 0; at < chunk.length; at += FORWARD_MAX_FRAME) {
      const part = chunk.subarray(at, at + FORWARD_MAX_FRAME)
      while (s.out + part.length > FORWARD_WINDOW && this.streams.get(id) === s) await new Promise<void>(r => s.waiting.push(r))
      if (this.streams.get(id) !== s || s.remoteDone) return
      s.out += part.length
      this.send(FRAME.data, id, part)
    }
  }

  private credit(id: number, s: Stream): void {
    const owed = s.taken - s.given
    if (owed <= 0 || this.streams.get(id) !== s) return
    s.given = s.taken
    this.send(FRAME.credit, id, u32(owed))
  }

  /** Forgets a stream; `tell` sends the forwarder a close for it. */
  private drop(id: number, tell: boolean, err?: Error): void {
    const s = this.streams.get(id)
    if (!s) return
    this.streams.delete(id)
    if (tell && !this.dead) this.send(FRAME.close, id)
    for (const w of s.waiting.splice(0)) w()
    if (s.onOpen && !s.opened) s.onOpen.reject(err ?? new AppDidNotAnswer('The app did not answer.'))
    else if (err && !s.socket.destroyed) s.socket.destroy(err)
  }

  private eof(s: Stream): void {
    if (s.eof) return
    s.eof = true
    s.socket.push(null)
  }

  private send(type: number, id: number, payload?: Buffer): void {
    if (this.dead || !this.proc.stdin) return
    const h = head(type, id, payload?.length ?? 0)
    this.proc.stdin.write(payload?.length ? Buffer.concat([h, payload]) : h)
  }

  private onData(d: Buffer): void {
    this.buf = this.buf.length ? Buffer.concat([this.buf, d]) : d
    while (this.buf.length >= 9 && !this.dead) {
      const length = this.buf.readUInt32BE(5)
      if (length > FORWARD_MAX_FRAME) return this.end()
      if (this.buf.length < 9 + length) return
      const type = this.buf[0]!
      const id = this.buf.readUInt32BE(1)
      const payload = Buffer.from(this.buf.subarray(9, 9 + length))
      this.buf = this.buf.subarray(9 + length)
      this.onFrame(type, id, payload)
    }
  }

  private onFrame(type: number, id: number, p: Buffer): void {
    if (type === FRAME.hello && id === 0) return this.helloSeen(true)
    const s = this.streams.get(id)
    // A frame for a stream that just closed on this side is expected; one for a stream never opened is not.
    if (!s) {
      if (id === 0 || id >= this.nextId) this.end()
      return
    }
    if (type === FRAME.opened && !s.opened) {
      s.opened = true
      s.onOpen?.resolve()
    } else if (type === FRAME.data && s.opened && !s.eof) {
      s.taken += p.length
      if (s.taken - s.given > FORWARD_WINDOW) return this.end()
      if (s.socket.push(p)) this.credit(id, s)
    } else if (type === FRAME.end && s.opened) {
      this.eof(s)
    } else if (type === FRAME.close) {
      s.remoteDone = true
      if (!s.opened) return this.drop(id, false)
      this.streams.delete(id)
      for (const w of s.waiting.splice(0)) w()
      this.eof(s)
    } else if (type === FRAME.credit && p.length === 4) {
      s.out = Math.max(0, s.out - p.readUInt32BE(0))
      for (const w of s.waiting.splice(0)) w()
    } else {
      this.end()
    }
  }
}

/** Starts a forwarder in the live preview's container. */
export async function startForwarder(id: string, spawn: Spawner, argv: string[]): Promise<ForwarderLink> {
  return new ForwarderLink(await spawn(id, argv))
}
