/**
 * The hum set, run as a model check (adaptive voice listening, spec §The backchannel): each telling's cuts through the
 * hum service's own call (`askHum`) on a real model, each call timed, and the marked points scored for kind (right,
 * near, wrong) and, apart, for tone. Development calls: no costing, no ledger.
 */
import type { ModelAdapter, ResolvedAccess } from '../../../contract'
import { askHum } from '../../../voice/humService/service'
import { cutsOf, type HumMark, type Telling } from './tellings'

/** As in hq: an answer later than this is dropped. */
const LIMIT_MS = 2_000

export type HumPoint = {
  mark: number; text: string; want: HumMark
  got: { kind: string; tone: string | null } | null
  kind: 'right' | 'near' | 'wrong' | 'no answer'
  /** The tone fits the mark's, when both want a hum of the same kind; null when there is no tone to judge. */
  tone: boolean | null
}

export type HumTellingResult = {
  tellingId: string; model: string; calls: number; ms: number[]; failed: number; overLimit: number
  points: HumPoint[]; inputTokens: number; outputTokens: number
}

export function scorePoint(want: HumMark, got: HumPoint['got']): Pick<HumPoint, 'kind' | 'tone'> {
  if (!got) return { kind: 'no answer', tone: null }
  const kind = got.kind === want.kind ? 'right' : want.kind !== 'none' && want.near?.includes(got.kind as never) ? 'near' : 'wrong'
  const tone = kind === 'right' && want.kind !== 'none' && want.tones ? want.tones.includes(got.tone as never) : null
  return { kind, tone }
}

export async function runHumTelling(telling: Telling, model: Pick<ModelAdapter, 'complete'>, access: ResolvedAccess): Promise<HumTellingResult> {
  const result: HumTellingResult = {
    tellingId: telling.id, model: access.model, calls: 0, ms: [], failed: 0, overLimit: 0, points: [], inputTokens: 0, outputTokens: 0,
  }
  for (const cut of cutsOf(telling)) {
    // A generous limit here, so a slow call is timed rather than lost; over hq's limit is counted.
    // A marked point is where they pause: asked as the page asks when a pause begins.
    const asked = await askHum(model, access, cut.text, { timeoutMs: 10_000, cacheKey: `hum-check-${telling.id}`, atPause: cut.mark !== null })
    result.calls++
    result.ms.push(asked.ms)
    if (asked.ms > LIMIT_MS) result.overLimit++
    if ('failed' in asked) result.failed++
    else {
      result.inputTokens += asked.usage.inputTokens
      result.outputTokens += asked.usage.outputTokens
    }
    if (cut.mark === null) continue
    const want = telling.marks[cut.mark]!
    const got = 'failed' in asked ? null : { kind: asked.answer.kind, tone: asked.answer.tone }
    result.points.push({ mark: cut.mark, text: cut.text, want, got, ...scorePoint(want, got) })
  }
  return result
}

const quantile = (sorted: number[], q: number) => sorted[Math.min(sorted.length - 1, Math.ceil(q * sorted.length) - 1)] ?? 0

/** The set's scores on one model: speed over every call, kind and tone at the marked points. */
export function humSummary(results: readonly HumTellingResult[]) {
  const ms = results.flatMap(r => r.ms).sort((a, b) => a - b)
  const points = results.flatMap(r => r.points)
  const toned = points.filter(p => p.tone !== null)
  return {
    calls: ms.length, medianMs: quantile(ms, 0.5), p90Ms: quantile(ms, 0.9), slowestMs: ms.at(-1) ?? 0,
    failed: results.reduce((n, r) => n + r.failed, 0), overLimit: results.reduce((n, r) => n + r.overLimit, 0),
    points: points.length, right: points.filter(p => p.kind === 'right').length, near: points.filter(p => p.kind === 'near').length,
    noneRight: points.filter(p => p.want.kind === 'none' && p.kind === 'right').length, nonePoints: points.filter(p => p.want.kind === 'none').length,
    toned: toned.length, toneRight: toned.filter(p => p.tone).length,
  }
}
