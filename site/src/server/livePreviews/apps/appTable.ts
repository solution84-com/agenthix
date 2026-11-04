/**
 * A live preview's apps on this site (live preview spec section 4, *The app*): one running copy per name, each a run
 * of its command in the live preview's container, its port registered with the guard from the moment it starts and
 * its process tree spared by the guard. Held in memory: an app's record is hq's, and a restart of the site stops them.
 *
 * States (core's `AppState`): starting until its port listens in the live preview's network on any address,
 * loopback included (failed after `APP_START_WAIT_MS`), running, paused with its live preview (run again on resume),
 * stopped by `stop_app` or the live preview's stop, failed when it exits or never listens. Every change is told to hq
 * (`livePreview.appState`), with the run that ended when one did.
 */
import {
  APPS_PER_LIVE_PREVIEW, APP_SPEC_PROBLEMS, APP_START_WAIT_MS, appSpecProblem,
  type AppRun, type AppRunEnding, type AppSpec, type AppState, type AppStatus, type LivePreviewAppRefused,
  type LivePreviewAppStateEvent, type LivePreviewState,
} from '@agenthix/core'
import { AppStartFailed, startAppProcess, type AppProcess, type AppSpawn } from './appProcess'
import { appWords } from './appWords'

export type Listening = { open: number[]; loopback: number[] }

/**
 * What the table knows of the live preview an app runs in: its id, who started it, where its copy is mounted in its
 * container (`root`) and on this disk (`hostDir`).
 */
export type PreviewOf = { id: string; personId: string; root: string; hostDir: string }

export type AppDeps = {
  spawn: AppSpawn
  /** The ports listening in the live preview's container now; throws when it cannot look. */
  listening(id: string): Promise<Listening>
  /** Kills these processes and everything under them (outside the launcher). */
  kill(id: string, pids: number[]): Promise<void>
  tell(event: LivePreviewAppStateEvent): void
  /** The live preview's services, started first; a refusal when its services file is refused. */
  beforeStart(lp: PreviewOf, spec: AppSpec): Promise<LivePreviewAppRefused | null>
  servicePorts(id: string): ReadonlySet<number>
  now(): number
  sleep(ms: number): Promise<void>
}

export const APP_POLL_MS = 1_000
export const PORT_FREE_WAIT_MS = 10_000
export const APP_STOP_WAIT_MS = 5_000
export const RESUME_TRIES = 30

type StartedBy = { agentId: string; runId: string } | null

type Entry = {
  spec: AppSpec
  lp: PreviewOf
  state: AppState
  since: number
  detail: string | null
  proc: AppProcess | null
  run: AppRun | null
  lines: string[]
  /** Paused while starting or running: run again when the live preview resumes. */
  resume: boolean
  stopping: boolean
  /** Moves on whenever what an earlier watcher waits for no longer stands. */
  generation: number
}

const LIVE: readonly AppState[] = ['starting', 'running', 'paused']

export class AppTable {
  private readonly previews = new Map<string, Map<string, Entry>>()
  private readonly queues = new Map<string, Promise<unknown>>()
  /** The relays carrying streams to apps, by live preview: spared by the guard while they run. */
  private readonly relays = new Map<string, Set<number>>()
  /** Live previews that have stopped: a start queued behind other work must not run in one. */
  private readonly stopped = new Set<string>()

  constructor(private readonly deps: AppDeps) {}

  private serial<T>(id: string, fn: () => Promise<T>): Promise<T> {
    const run = (this.queues.get(id) ?? Promise.resolve()).then(fn, fn)
    this.queues.set(id, run.catch(() => {}))
    return run
  }

  private entries(id: string): Map<string, Entry> {
    let m = this.previews.get(id)
    if (!m) this.previews.set(id, (m = new Map()))
    return m
  }

  private byId(id: string, appId: string): Entry | null {
    for (const e of this.previews.get(id)?.values() ?? []) if (e.spec.appId === appId) return e
    return null
  }

  status(e: Entry): AppStatus {
    return {
      ...e.spec, livePreviewId: e.lp.id, state: e.state, since: new Date(e.since).toISOString(),
      lastLines: e.proc ? e.proc.lastLines() : e.lines, detail: e.detail,
    }
  }

  private move(e: Entry, state: AppState, detail: string | null, ended: AppRun | null = null): void {
    e.state = state
    e.since = this.deps.now()
    e.detail = detail
    this.deps.tell({ app: this.status(e), run: ended, at: new Date(e.since).toISOString() })
  }

  private endRun(e: Entry, ending: AppRunEnding): AppRun | null {
    if (e.proc) e.lines = e.proc.lastLines()
    if (!e.run || e.run.endedAt) return null
    e.run = { ...e.run, endedAt: new Date(this.deps.now()).toISOString(), ending, lastLines: e.lines }
    return e.run
  }

  start(lp: PreviewOf, spec: AppSpec, startedBy: StartedBy): Promise<{ app: AppStatus } | LivePreviewAppRefused> {
    return this.serial(lp.id, () => this.startNow(lp, spec, startedBy))
  }

  private async startNow(lp: PreviewOf, spec: AppSpec, startedBy: StartedBy): Promise<{ app: AppStatus } | LivePreviewAppRefused> {
    if (this.stopped.has(lp.id)) return { refused: 'badSpec', detail: appWords.previewStopped }
    const problem = appSpecProblem(spec)
    if (problem) return { refused: 'badSpec', detail: APP_SPEC_PROBLEMS[problem] }
    const apps = this.entries(lp.id)
    const others = [...apps.values()].filter(e => e.spec.name !== spec.name)
    if (others.some(e => e.spec.appId === spec.appId)) return { refused: 'badSpec', detail: APP_SPEC_PROBLEMS.appId }
    const sharing = others.find(e => LIVE.includes(e.state) && e.spec.port === spec.port)
    if (sharing) return { refused: 'portTaken', detail: appWords.portOfApp(spec.port, sharing.spec.name) }
    if (others.filter(e => LIVE.includes(e.state)).length >= APPS_PER_LIVE_PREVIEW) return { refused: 'tooManyApps', detail: appWords.tooMany }
    const services = await this.deps.beforeStart(lp, spec)
    if (services) return services
    if (this.stopped.has(lp.id)) return { refused: 'badSpec', detail: appWords.previewStopped }
    if (this.deps.servicePorts(lp.id).has(spec.port)) return { refused: 'portTaken', detail: appWords.portOfService(spec.port) }

    const old = apps.get(spec.name)
    if (old && (old.proc || old.state === 'starting' || old.state === 'running')) await this.stopEntry(old, 'replaced', 'stopped', appWords.replaced)
    if (!(await this.portFree(lp.id, spec.port))) return { refused: 'portTaken', detail: appWords.portInUse(spec.port) }
    if (this.stopped.has(lp.id)) return { refused: 'badSpec', detail: appWords.previewStopped }

    const now = this.deps.now()
    const e: Entry = old ?? { spec, lp, state: 'starting', since: now, detail: null, proc: null, run: null, lines: [], resume: false, stopping: false, generation: 0 }
    Object.assign(e, { spec, lp, resume: false, lines: [], generation: e.generation + 1 })
    e.run = {
      appId: spec.appId, livePreviewId: lp.id, personId: lp.personId, agentId: startedBy?.agentId ?? null,
      runId: startedBy?.runId ?? null, startedAt: new Date(now).toISOString(), endedAt: null, ending: null, lastLines: [],
    }
    apps.set(spec.name, e)
    e.state = 'starting'
    try {
      e.proc = await startAppProcess(this.deps.spawn, lp.id, lp.root, spec)
    } catch (err) {
      if (!(err instanceof AppStartFailed)) {
        e.run = null
        e.state = 'failed'
        throw err
      }
      e.lines = err.lines
      this.move(e, 'failed', appWords.didNotStart, this.endRun(e, 'exited'))
      return { app: this.status(e) }
    }
    const proc = e.proc
    void proc.exited.then(code => this.exited(e, proc, code))
    this.move(e, 'starting', null)
    e.run = { ...e.run, startedAt: new Date(e.since).toISOString() }
    void this.watchStart(e, e.generation)
    return { app: this.status(e) }
  }

  private async portFree(id: string, port: number): Promise<boolean> {
    for (let waited = 0; ; waited += APP_POLL_MS) {
      const now = await this.deps.listening(id).catch(() => null)
      if (now && !now.open.includes(port) && !now.loopback.includes(port)) return true
      if (waited >= PORT_FREE_WAIT_MS) return false
      await this.deps.sleep(APP_POLL_MS)
    }
  }

  /** Starting until the port listens, on any address the live preview's network has, loopback included. */
  private async watchStart(e: Entry, generation: number): Promise<void> {
    for (let waited = 0; waited < APP_START_WAIT_MS; waited += APP_POLL_MS) {
      await this.deps.sleep(APP_POLL_MS)
      if (e.generation !== generation || e.state !== 'starting' || !e.proc) return
      const now = await this.deps.listening(e.lp.id).catch(() => null)
      if (now && (now.open.includes(e.spec.port) || now.loopback.includes(e.spec.port))) {
        this.move(e, 'running', null)
        return
      }
    }
    if (e.generation !== generation || e.state !== 'starting') return
    await this.stopEntry(e, 'noAnswer', 'failed', appWords.noAnswer(e.spec.port))
  }

  private exited(e: Entry, proc: AppProcess, code: number): void {
    if (e.proc !== proc || e.stopping) return
    e.lines = proc.lastLines()
    e.proc = null
    e.generation += 1
    if (e.state === 'paused') {
      this.deps.tell({ app: this.status(e), run: this.endRun(e, 'previewPaused'), at: new Date(this.deps.now()).toISOString() })
      return
    }
    const detail = e.state === 'starting' ? appWords.exitedEarly(e.spec.port, code) : appWords.exited(code)
    this.move(e, 'failed', detail, this.endRun(e, 'exited'))
  }

  private async stopEntry(e: Entry, ending: AppRunEnding, state: AppState, detail: string | null): Promise<void> {
    e.stopping = true
    e.generation += 1
    const proc = e.proc
    try {
      if (proc?.alive()) {
        await this.deps.kill(e.lp.id, [proc.pid]).catch(() => {})
        await Promise.race([proc.exited, this.deps.sleep(APP_STOP_WAIT_MS)])
      }
      const ended = this.endRun(e, ending)
      proc?.detach()
      e.proc = null
      e.resume = false
      this.move(e, state, detail, ended)
    } finally {
      e.stopping = false
    }
  }

  stop(id: string, appId: string, ending: AppRunEnding = 'stopped', detail: string | null = null): Promise<{ app: AppStatus } | LivePreviewAppRefused> {
    return this.serial(id, async () => {
      const e = this.byId(id, appId)
      if (!e) return { refused: 'unknownApp' as const, detail: appWords.unknownApp }
      if (e.proc || LIVE.includes(e.state)) await this.stopEntry(e, ending, 'stopped', detail)
      return { app: this.status(e) }
    })
  }

  list(id: string): AppStatus[] {
    return [...(this.previews.get(id)?.values() ?? [])].map(e => this.status(e))
  }

  /** Whether the app is running or starting: an `app.open` is answered only then. */
  openable(id: string, appId: string): boolean {
    const e = this.byId(id, appId)
    return !!e && (e.state === 'running' || e.state === 'starting')
  }

  /** The port of a running app, for the relay's streams; null otherwise. */
  portFor(id: string, appId: string): number | null {
    const e = this.byId(id, appId)
    return e?.state === 'running' && e.proc ? e.spec.port : null
  }

  /** A relay carrying a stream to one of the live preview's apps: spared until the answer is called. */
  holdRelay(id: string, pid: number): () => void {
    const set = this.relays.get(id) ?? new Set<number>()
    set.add(pid)
    this.relays.set(id, set)
    return () => { set.delete(pid) }
  }

  /** The guard's *Stop the app*: the app, or every app of the live preview when none is named. */
  async stopByGuard(id: string, appId: string | null): Promise<boolean> {
    let stopped = false
    for (const e of [...(this.previews.get(id)?.values() ?? [])]) {
      if ((appId && e.spec.appId !== appId) || !(e.proc || LIVE.includes(e.state))) continue
      await this.stop(id, e.spec.appId, 'guard', appWords.guard)
      stopped = true
    }
    return stopped
  }

  /** Follows the live preview: paused with it, run again on its resume, stopped and forgotten when it stops. */
  previewChanged(id: string, state: LivePreviewState): void {
    if (state.state === 'stopped') this.stopped.add(id)
    else this.stopped.delete(id)
    const apps = this.previews.get(id)
    if (!apps) return
    if (state.state === 'stopped') {
      for (const e of apps.values()) {
        e.generation += 1
        const ended = this.endRun(e, 'previewStopped')
        e.proc?.detach()
        e.proc = null
        if (e.state !== 'stopped' || ended) this.move(e, 'stopped', appWords.previewStopped, ended)
      }
      this.previews.delete(id)
      this.queues.delete(id)
      this.relays.delete(id)
      return
    }
    if (state.state === 'paused') {
      for (const e of apps.values()) {
        if (e.state !== 'starting' && e.state !== 'running') continue
        e.generation += 1
        e.resume = true
        this.move(e, 'paused', appWords.paused)
      }
      return
    }
    if (state.state === 'running') for (const e of apps.values()) if (e.state === 'paused' && e.resume) void this.resume(e)
  }

  private async resume(e: Entry): Promise<void> {
    e.resume = false
    if (e.proc?.alive()) {
      this.move(e, 'running', null)
      return
    }
    for (let tries = 0; tries < RESUME_TRIES; tries++) {
      try {
        const started = await this.start(e.lp, e.spec, null)
        // A refusal is an answer, not a failure to try again: the app stays what it was told it is.
        if ('refused' in started && e.state === 'paused') this.move(e, 'failed', started.detail)
        return
      } catch {
        await this.deps.sleep(APP_POLL_MS)
      }
    }
    this.move(e, 'failed', appWords.didNotStart)
  }

  /** The top processes the guard spares with everything under them: each app's that runs, and each relay's. */
  spared(id: string): Set<number> {
    const apps = [...(this.previews.get(id)?.values() ?? [])].flatMap(e => (e.proc?.alive() ? [e.proc.pid] : []))
    return new Set([...apps, ...(this.relays.get(id) ?? [])])
  }

  /** The ports of the live preview's apps that run, start or wait paused. */
  registeredPorts(id: string): Set<number> {
    return new Set([...(this.previews.get(id)?.values() ?? [])].filter(e => e.proc || LIVE.includes(e.state)).map(e => e.spec.port))
  }
}
