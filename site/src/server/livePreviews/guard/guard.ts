/**
 * The live-preview guard (live preview spec section 6, *The guard*): in the site, on the machine's side of every live
 * preview's containers. It runs from the site's start wherever the site makes containers, and tells hq every
 * `GUARD_REPORT_EVERY_MS` that it runs (`livePreview.guardReport`), so hq starts none on a site whose guard is quiet.
 * While a live preview is watched it looks at it every `GUARD_CHECK_EVERY_MS` and on every Docker event for its
 * containers, and acts on what it finds through the responder.
 *
 * Each second it also checks the line to hq: down for `LIVE_PREVIEW_LINE_LOSS_PAUSE_MS`, every running live preview
 * pauses; once it is back, each one it paused resumes by itself.
 *
 * Fail closed: a live preview it cannot look at, or an event stream it cannot keep, is stopped (`guardDown`); and while
 * it cannot watch, it stops reporting, so hq starts no more.
 */
import {
  GUARD_CHECK_EVERY_MS, GUARD_REPORT_EVERY_MS, LIVE_PREVIEW_LINE_LOSS_PAUSE_MS,
  type GuardSignal, type LivePreviewGuardReportEvent,
} from '@agenthix/core'
import { Logger } from '../../utils/logger'
import type { DockerEvent, EventStream } from './guardDocker'
import { execCommand, meaningOf } from './events'
import { LOOK_FAILURES_ALLOWED, PreviewWatch, type LookDeps, type WatchedPreview } from './look'
import { GuardResponder, type GuardTarget, type ResponseActions, type SignalFacts } from './respond'

const logger = new Logger('livePreviewGuard')

export const LINE_CHECK_EVERY_MS = 1_000
export const EVENT_RESTARTS_PER_MINUTE = 3

export type GuardDeps = LookDeps & {
  actions: ResponseActions
  /** The live preview as the store has it now; null when it has stopped. */
  watched(id: string): Promise<WatchedPreview | null>
  /** Whether a live preview the store holds is live, for a container that turns up before it is watched. */
  isLive(id: string): Promise<boolean>
  pauseForLineLoss(id: string): Promise<unknown>
  resumeAfterLineLoss(id: string): Promise<unknown>
  /** Every live preview running now, for the line-loss pause. */
  running(): Promise<string[]>
  stopForMemory(id: string): Promise<unknown>
  hqLineUp(): boolean
  report(event: LivePreviewGuardReportEvent): void
  setInterval(fn: () => void, ms: number): unknown
  clearInterval(handle: unknown): void
}

export class LivePreviewGuard {
  readonly responder: GuardResponder
  private watches = new Map<string, PreviewWatch>()
  private looking = new Map<string, Promise<void>>()
  private again = new Set<string>()
  private stream: EventStream | null = null
  private restarts: number[] = []
  private timers: unknown[] = []
  private started = false
  private down = false
  private lineDownSince: number | null = null
  private pausedForLine = new Set<string>()

  constructor(private readonly deps: GuardDeps) {
    this.responder = new GuardResponder(deps.actions)
  }

  /** Whether the guard runs and can watch: no live preview starts while it does not. */
  get healthy(): boolean {
    return this.started && !this.down
  }

  watching(): string[] {
    return [...this.watches.keys()]
  }

  start(): void {
    if (this.started) return
    this.started = true
    this.down = false
    this.timers = [
      this.deps.setInterval(() => void this.sweep(), GUARD_CHECK_EVERY_MS),
      this.deps.setInterval(() => this.sendReport(), GUARD_REPORT_EVERY_MS),
      this.deps.setInterval(() => void this.checkLine(), LINE_CHECK_EVERY_MS),
    ]
    this.sendReport()
  }

  stop(): void {
    this.started = false
    for (const t of this.timers) this.deps.clearInterval(t)
    this.timers = []
    this.stream?.stop()
    this.stream = null
  }

  /** Starts watching, once its container has started; throws when the guard cannot. */
  async watch(lp: WatchedPreview): Promise<void> {
    if (!this.healthy) throw new Error('The live-preview guard is not running.')
    this.watches.set(lp.id, new PreviewWatch(lp))
    this.ensureStream()
    await this.look(lp.id)
  }

  unwatch(id: string): void {
    this.watches.delete(id)
    this.pausedForLine.delete(id)
    this.responder.forget(id)
    if (!this.watches.size) {
      this.stream?.stop()
      this.stream = null
      this.down = false
      this.restarts = []
    }
  }

  /** A signal another part of the site found (the relay, a refused link), acted on now. */
  raise(signal: GuardSignal, facts: SignalFacts): Promise<unknown> {
    return this.responder.respond(signal, facts)
  }

  reportNow(): void {
    this.sendReport()
  }

  private sendReport(): void {
    if (!this.healthy) return
    this.deps.report({ at: new Date(this.deps.now()).toISOString(), livePreviewIds: this.watching() })
  }

  private ensureStream(): void {
    if (this.stream || !this.watches.size) return
    this.stream = this.deps.docker.events(e => void this.onEvent(e), why => this.onStreamEnd(why))
  }

  private onStreamEnd(why: string): void {
    this.stream = null
    if (!this.watches.size || !this.started) return
    const now = this.deps.now()
    this.restarts = [...this.restarts.filter(t => now - t < 60_000), now]
    if (this.restarts.length > EVENT_RESTARTS_PER_MINUTE) {
      logger.error(`Docker's events for live previews stopped and would not stay up (${why}).`)
      this.down = true
      void Promise.all([...this.watches.values()].map(w => this.raise('guardDown', { lp: w.lp, what: 'it could not hear Docker' })))
      return
    }
    logger.warn(`Docker's events for live previews stopped (${why}); listening again.`)
    this.ensureStream()
    void this.sweep()
  }

  private async onEvent(event: DockerEvent): Promise<void> {
    if (!event.livePreviewId) return
    const meaning = meaningOf(event)
    if (meaning.kind === 'none') return
    const watch = this.watches.get(event.livePreviewId)
    if (!watch) {
      // A container made before its watch starts is expected; one for no live preview is no one's.
      if (await this.deps.isLive(event.livePreviewId).catch(() => false)) return
      logger.error(`A container with the label of live preview ${event.livePreviewId}, which is not open, was found and removed.`)
      await this.deps.docker.kill([event.containerId])
      return
    }
    if (meaning.kind === 'signal') {
      const command = execCommand(event)
      if (command !== null && this.deps.services?.healthCheck(event.livePreviewId, event.name, command)) return
      await this.raise('notMadeBySite', { lp: watch.lp, what: meaning.what })
    } else await this.look(event.livePreviewId)
  }

  private async sweep(): Promise<void> {
    if (!this.started) return
    await Promise.all(this.watching().map(id => this.look(id)))
  }

  private look(id: string): Promise<void> {
    const running = this.looking.get(id)
    if (running) {
      this.again.add(id)
      return running
    }
    const work = this.lookOnce(id).finally(() => {
      this.looking.delete(id)
      if (this.again.delete(id)) void this.look(id)
    })
    this.looking.set(id, work)
    return work
  }

  private async lookOnce(id: string): Promise<void> {
    const watch = this.watches.get(id)
    if (!watch || this.responder.ending(id)) return
    try {
      const lp = await this.deps.watched(id)
      if (!lp) {
        this.unwatch(id)
        return
      }
      watch.lp = lp
      const findings = await watch.look(this.deps)
      watch.failures = 0
      for (const f of findings) {
        if ('outOfMemory' in f) await this.stopForMemory(f.outOfMemory)
        else await this.raise(f.signal, f.facts)
      }
    } catch (err) {
      if (this.watches.get(id) !== watch) return
      watch.failures += 1
      const why = err instanceof Error ? err.message : String(err)
      logger.warn(`The guard could not look at live preview ${id} (${why}).`)
      if (watch.failures > LOOK_FAILURES_ALLOWED) await this.raise('guardDown', { lp: watch.lp, what: why })
    }
  }

  private async stopForMemory(lp: GuardTarget): Promise<void> {
    await this.deps.actions.killContainers(lp.id).catch(err => logger.error(`Could not kill what is left of live preview ${lp.id}: ${String(err)}`))
    await this.deps.stopForMemory(lp.id)
    this.unwatch(lp.id)
  }

  private async checkLine(): Promise<void> {
    const now = this.deps.now()
    if (this.deps.hqLineUp()) {
      this.lineDownSince = null
      const paused = [...this.pausedForLine]
      this.pausedForLine.clear()
      for (const id of paused) await this.deps.resumeAfterLineLoss(id).catch(err => logger.error(`Could not resume live preview ${id}: ${String(err)}`))
      return
    }
    this.lineDownSince ??= now
    if (now - this.lineDownSince < LIVE_PREVIEW_LINE_LOSS_PAUSE_MS) return
    for (const id of await this.deps.running().catch(() => [] as string[])) {
      if (this.pausedForLine.has(id)) continue
      this.pausedForLine.add(id)
      await this.deps.pauseForLineLoss(id).catch(err => logger.error(`Could not pause live preview ${id}: ${String(err)}`))
    }
  }

  /** A live preview paused for a lost line before this process started (a restart): resumed once the line is up. */
  markPausedForLine(id: string): void {
    this.pausedForLine.add(id)
  }
}
