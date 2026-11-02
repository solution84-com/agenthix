/**
 * Which way an app stream reaches its app (live preview spec section 4, *The app*):
 *
 * - **Through the live preview's forwarder** (`appForwarder.ts`): one `docker exec` for every stream of that live
 *   preview. Started by the first stream; the streams that come while it starts wait for it.
 * - **One `docker exec` per stream** (`appConnect.ts`), only while the forwarder cannot answer (it failed to start, or
 *   ended and is waiting to be started again). Those run under a site-wide limit, as the commit helpers do, so a page
 *   of hundreds of modules never starts hundreds of execs.
 *
 * A forwarder ends with its live preview's pause or stop (`stopForwarder`), and with its container.
 */
import { Slots } from '../../branches/helperSlots'
import { connectToApp, type AppConnection, type Spawner } from './appConnect'
import { AppDidNotAnswer, ForwarderLink, startForwarder } from './appForwarder'
import { appForwarderArgv } from './appForwarderScript'

/** Per-stream execs at once across the site, while a forwarder cannot answer. */
export const PER_STREAM_EXECS = 4
/** How long a stream waits for a forwarder that is starting, or for a per-stream slot. */
export const FORWARDER_START_MS = 5_000
/** After a forwarder failed to start, how long before another is tried. */
export const FORWARDER_RETRY_MS = 10_000

export type AppStreamDeps = {
  spawn: Spawner
  /** Holds a process id of the site's own for the guard; answers the release. */
  hold: (livePreviewId: string, pid: number) => () => void
  /** A command of the site's own is starting in the container, until its process id is held (the guard's leeway). */
  execBegins: (livePreviewId: string) => () => void
  now: () => number
}

/** Every per-stream exec stayed busy for as long as a stream waits. */
export class StreamsBusy extends Error {}

type Entry = { link: ForwarderLink | null; starting: Promise<ForwarderLink | null> | null; failedAt: number | null }

export class AppStreams {
  private readonly forwarders = new Map<string, Entry>()
  readonly perStream = new Slots(PER_STREAM_EXECS)

  constructor(private readonly deps: AppStreamDeps) {}

  /** A stream to the app's port in the live preview's container. Throws when the app does not answer or the site is busy. */
  async connect(livePreviewId: string, port: number): Promise<AppConnection> {
    const link = await this.forwarder(livePreviewId)
    if (link) {
      try {
        return { socket: await link.open(port), pid: Promise.resolve(null) }
      } catch (err) {
        if (err instanceof AppDidNotAnswer || link.alive) throw err
        // The forwarder ended under this stream: it is carried one exec of its own instead.
      }
    }
    const release = await this.perStream.acquire(FORWARDER_START_MS)
    if (!release) throw new StreamsBusy('No app stream came free in time.')
    try {
      const connection = await connectToApp(livePreviewId, port, this.deps.spawn)
      // The slot is free once the exec itself has ended, not only its stream.
      void (connection.exited ?? new Promise(r => connection.socket.once('close', r))).then(release)
      return connection
    } catch (err) {
      release()
      throw err
    }
  }

  /** The live preview's forwarder once it answers; null while it cannot. */
  private async forwarder(id: string): Promise<ForwarderLink | null> {
    const entry = this.forwarders.get(id) ?? { link: null, starting: null, failedAt: null }
    this.forwarders.set(id, entry)
    if (entry.link?.alive) return entry.link
    if (!entry.starting) {
      if (entry.failedAt !== null && this.deps.now() - entry.failedAt < FORWARDER_RETRY_MS) return null
      entry.starting = this.start(id, entry)
    }
    let timer: ReturnType<typeof setTimeout> | undefined
    const late = new Promise<null>(resolve => { timer = setTimeout(() => resolve(null), FORWARDER_START_MS) })
    try {
      return await Promise.race([entry.starting, late])
    } finally {
      clearTimeout(timer)
    }
  }

  private async start(id: string, entry: Entry): Promise<ForwarderLink | null> {
    let link: ForwarderLink | null = null
    const begun = this.deps.execBegins(id)
    try {
      link = await startForwarder(id, this.deps.spawn, appForwarderArgv())
      let release = () => {}
      void link.pid.then(pid => {
        if (pid !== null && link?.alive) release = this.deps.hold(id, pid)
        begun()
      })
      const started = link
      void link.exited.then(() => {
        release()
        if (entry.link === started) entry.link = null
      })
      const ok = await Promise.race([link.ready, new Promise<boolean>(r => setTimeout(() => r(false), FORWARDER_START_MS).unref())])
      if (!ok) throw new Error('The app forwarder did not say it was ready.')
      // Stopped while it started: it ends here.
      if (this.forwarders.get(id) !== entry) throw new Error('The live preview stopped.')
      entry.link = link
      entry.failedAt = null
      return link
    } catch {
      begun()
      link?.end()
      entry.failedAt = this.deps.now()
      return null
    } finally {
      entry.starting = null
    }
  }

  /** Ends the live preview's forwarder and every stream on it: its pause or stop. */
  stop(id: string): void {
    const entry = this.forwarders.get(id)
    this.forwarders.delete(id)
    entry?.link?.end()
  }

  stopAll(): void {
    for (const id of [...this.forwarders.keys()]) this.stop(id)
  }
}
