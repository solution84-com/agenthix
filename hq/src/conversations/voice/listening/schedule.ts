/**
 * When the light model is asked again (adaptive voice listening, spec §When it is asked): hq's own schedule, from the
 * listener settings; the light model decides only what it says at each check. hq sends the wait in
 * `listened.nextCheckSecs`, and the browser waits that long from the answer's arrival, so the wait counts from the
 * quiet (or the working time) now, not from when the call was sent.
 */
import type { ListenerSettings } from '../listener'

/** The least wait sent, however close the next check is due: the browser's own least. */
const MIN_WAIT_MS = 1000

/** How near a check's time a call counts as that check: a call comes at its time or just after, never much before. */
const AT_CHECK_MS = 500

export type Waiting = { kind: 'quiet'; quietMs: number } | { kind: 'working'; workingMs: number }

/** The quiet's checks and the "not yet" limit, in milliseconds, in order. */
function quietPoints(settings: ListenerSettings): number[] {
  const { quietFirst, quietSecond, quietThird } = settings.schedule
  return [quietFirst * 1000, quietSecond * 1000, quietThird * 1000, settings.notYetMaxSilenceMs].sort((a, b) => a - b)
}

const secs = (ms: number) => Math.max(MIN_WAIT_MS, ms) / 1000

/** The seconds until the next check: the next of the quiet's checks, or the next beat of the working cadence. */
export function nextCheckSecs(w: Waiting, settings: ListenerSettings): number {
  if (w.kind === 'working') {
    const first = settings.schedule.workingFirst * 1000
    const every = settings.schedule.workingEvery * 1000
    if (w.workingMs < first) return secs(first - w.workingMs)
    return secs(every - ((w.workingMs - first) % every))
  }
  const points = quietPoints(settings)
  const next = points.find(p => p > w.quietMs)
  if (next !== undefined) return secs(next - w.quietMs)
  // Past the limit (a quiet the sound model never ended): the last gap, again.
  return secs(points.at(-1)! - points.at(-2)!)
}

/** Whether a check at this quiet is the last of the quiet's checks before the "not yet" limit. */
export function isLastQuietCheck(quietMs: number, settings: ListenerSettings): boolean {
  const points = quietPoints(settings)
  const limit = points.at(-1)!
  return quietMs >= points.at(-2)! - AT_CHECK_MS && quietMs < limit
}
