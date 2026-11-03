/**
 * What the guard does about a signal, by core's `GUARD_RESPONSE`, within `GUARD_ACT_WITHIN_MS`: containers are killed
 * first, before anything that waits on the store, so nothing of a live preview keeps running while its record is
 * written. One live preview's responses run one after another; one being stopped takes no more. Every response is
 * logged on the site and told to hq (`livePreview.guard`), which tells the people who have it open and the fleet admins.
 */
import { GUARD_RESPONSE, type GuardSignal, type GuardStep, type LivePreviewGuardEvent } from '@agenthix/core'
import { Logger } from '../../utils/logger'
import { guardDetail } from './words'

const logger = new Logger('livePreviewGuard')

export type GuardTarget = { id: string; projectId: string | null }

export type ResponseActions = {
  pause(id: string, detail: string, signal: GuardSignal): Promise<unknown>
  stop(id: string, detail: string, signal: GuardSignal): Promise<unknown>
  killContainers(id: string): Promise<void>
  killProcesses(id: string, pids: number[]): Promise<void>
  stopApp(id: string, appId: string | null): Promise<boolean>
  tell(event: LivePreviewGuardEvent): void
  now(): number
}

export type SignalFacts = {
  /** Null for something of the site's own that belongs to no live preview. */
  lp: GuardTarget | null
  what?: string
  pids?: number[]
  app?: string
}

export class GuardResponder {
  private chains = new Map<string, Promise<unknown>>()
  private stopping = new Set<string>()
  private seen = new Map<string, Set<GuardSignal>>()

  constructor(private readonly act: ResponseActions) {}

  ending(id: string): boolean {
    return this.stopping.has(id)
  }

  forget(id: string): void {
    this.stopping.delete(id)
    this.seen.delete(id)
    this.chains.delete(id)
  }

  respond(signal: GuardSignal, facts: SignalFacts): Promise<GuardStep[]> {
    const key = facts.lp?.id ?? ''
    const next = (this.chains.get(key) ?? Promise.resolve()).catch(() => undefined).then(() => this.run(signal, facts))
    this.chains.set(key, next)
    return next
  }

  private repeat(id: string, signal: GuardSignal): boolean {
    const seen = this.seen.get(id) ?? new Set<GuardSignal>()
    this.seen.set(id, seen)
    const again = seen.has(signal)
    seen.add(signal)
    return again
  }

  private async run(signal: GuardSignal, facts: SignalFacts): Promise<GuardStep[]> {
    const { lp } = facts
    if (lp && this.stopping.has(lp.id)) return []
    let response = GUARD_RESPONSE[signal]
    if (response === 'pauseThenStop') response = lp && this.repeat(lp.id, signal) ? 'stopPreview' : 'pause'
    const steps: GuardStep[] = []
    const failed: string[] = []
    const detailFor = () => guardDetail(signal, [...steps, 'alerted'], facts.what)
    const attempt = async (what: string, work: () => Promise<unknown>) => {
      try {
        await work()
        return true
      } catch (err) {
        failed.push(`${what}: ${err instanceof Error ? err.message : String(err)}`)
        return false
      }
    }
    switch (response) {
      case 'stopPreview':
        if (!lp) break
        this.stopping.add(lp.id)
        await attempt('kill its containers', () => this.act.killContainers(lp.id))
        steps.push('previewStopped')
        await attempt('stop the live preview', () => this.act.stop(lp.id, detailFor(), signal))
        break
      case 'killProcessAndPause':
        if (!lp) break
        if (facts.pids?.length && await attempt('kill the process', () => this.act.killProcesses(lp.id, facts.pids ?? []))) steps.push('processKilled')
        steps.push('paused')
        await attempt('pause the live preview', () => this.act.pause(lp.id, detailFor(), signal))
        break
      case 'pause':
      case 'pauseAndAsk':
        if (!lp) break
        steps.push('paused')
        if (response === 'pauseAndAsk') steps.push('asked')
        await attempt('pause the live preview', () => this.act.pause(lp.id, detailFor(), signal))
        break
      case 'refuse':
        steps.push('refused')
        break
      case 'stopApp':
        if (lp && await this.act.stopApp(lp.id, facts.app ?? null).catch(() => false)) steps.push('appStopped')
        break
    }
    steps.push('alerted')
    const detail = guardDetail(signal, steps, facts.what)
    logger[response === 'stopPreview' || response === 'killProcessAndPause' ? 'error' : 'warn'](`${lp ? `Live preview ${lp.id}: ` : ''}${detail}`)
    for (const f of failed) logger.error(`The guard could not ${f}.`)
    this.act.tell({ livePreviewId: lp?.id ?? null, projectId: lp?.projectId ?? null, signal, steps, detail, at: new Date(this.act.now()).toISOString() })
    return steps
  }
}
