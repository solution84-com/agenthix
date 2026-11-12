/**
 * The probe's two bars, per organisation (memory and knowledge spec, What decides a recall: measured, then tuned).
 * They start at the local model's calibration and move a small step a day, from the outcomes of the last 30 days:
 *
 * - Items included as certain that the lead seldom relied on: the certain bar is too low, and rises.
 * - Hinted items the lead mostly went on to read: they were certain in all but name, and the certain bar falls.
 * - Hinted items the lead almost never read: the hint is noise, and the probable bar rises.
 * - Items the lead needed that the probe scored below the probable bar: the probable bar falls toward them.
 *
 * Too few outcomes for a rule and it leaves its bar alone. The bars stay apart and within sane limits. A Rule
 * included only because of its kind's weight (ADR-0188) is left out: it says nothing about where the bars should be,
 * and counting it would pull them down for every memory.
 */
import { prisma } from 'wasp/server'
import { DEFAULT_CERTAIN_BAR, DEFAULT_PROBABLE_BAR } from '../shared/memory/protocol'

export interface Bars { certain: number; probable: number }

export interface BarSamples {
  /** Each item the probe included, by its similarity, and whether the lead relied on it in that turn. */
  included: { similarity: number; used: boolean }[]
  /** Each item the probe hinted, and whether the lead then recalled it in that turn. */
  hinted: { similarity: number; taken: boolean }[]
  /** The probe's similarity for each item it missed, where it had one. */
  missed: number[]
}

export const TUNING_WINDOW_DAYS = 30
export const MIN_SAMPLES = 20
export const BAR_STEP = 0.02
const PROBABLE_RANGE = { min: 0.3, max: 0.8 }
const CERTAIN_MAX = 0.95
const BAR_GAP = 0.05
const INCLUDED_USE_FLOOR = 0.5
const HINT_TAKEN_HIGH = 0.6
const HINT_TAKEN_LOW = 0.1
/** Misses count once they are this share of what the probe showed. */
const MISSED_SHARE = 0.1
const MISSED_MIN = 5

const rate = (hits: number, of: number) => (of === 0 ? 0 : hits / of)
const round = (n: number) => Math.round(n * 1000) / 1000
const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n))

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2
}

export function tuneBars(bars: Bars, samples: BarSamples): Bars {
  let { certain, probable } = bars
  const { included, hinted, missed } = samples

  const hintTaken = rate(hinted.filter(h => h.taken).length, hinted.length)
  if (included.length >= MIN_SAMPLES && rate(included.filter(i => i.used).length, included.length) < INCLUDED_USE_FLOOR) {
    certain += BAR_STEP
  } else if (hinted.length >= MIN_SAMPLES && hintTaken > HINT_TAKEN_HIGH) {
    certain -= BAR_STEP
  }

  const below = missed.filter(s => s < probable)
  const shown = included.length + hinted.length
  if (below.length >= Math.max(MISSED_MIN, MISSED_SHARE * shown)) {
    probable = Math.max(probable - BAR_STEP, median(below))
  } else if (hinted.length >= MIN_SAMPLES && hintTaken < HINT_TAKEN_LOW) {
    probable += BAR_STEP
  }

  probable = clamp(probable, PROBABLE_RANGE.min, PROBABLE_RANGE.max)
  certain = clamp(certain, probable + BAR_GAP, CERTAIN_MAX)
  return { certain: round(certain), probable: round(probable) }
}

/** The organisation's bars now: its own once tuned, the calibration until then. */
export async function currentBars(): Promise<Bars> {
  const org = await prisma.org.findFirst({ select: { memoryCertainBar: true, memoryProbableBar: true } })
  return { certain: org?.memoryCertainBar ?? DEFAULT_CERTAIN_BAR, probable: org?.memoryProbableBar ?? DEFAULT_PROBABLE_BAR }
}

export type OutcomeRow = { kind: string; itemId: string | null; turnId: string | null; similarity: number | null; weighted: boolean }

/** Outcomes joined per turn and item: what the probe showed, and what the lead did with it. */
export function samplesOf(rows: readonly OutcomeRow[]): BarSamples {
  const did = new Set(rows.filter(r => r.kind === 'USED' || r.kind === 'RECALLED').map(r => `${r.kind}:${r.turnId}:${r.itemId}`))
  const was = (kind: string, r: OutcomeRow) => did.has(`${kind}:${r.turnId}:${r.itemId}`)
  return {
    included: rows.filter(r => r.kind === 'INCLUDED' && !r.weighted && r.similarity !== null).map(r => ({ similarity: r.similarity!, used: was('USED', r) })),
    hinted: rows.filter(r => r.kind === 'HINTED' && r.similarity !== null).map(r => ({ similarity: r.similarity!, taken: was('RECALLED', r) })),
    missed: rows.filter(r => r.kind === 'MISSED' && r.similarity !== null).map(r => r.similarity!),
  }
}

/** The window's outcomes, as samples for the bars. */
export async function barSamples(since: Date): Promise<BarSamples> {
  return samplesOf(await prisma.memoryOutcome.findMany({
    where: { createdAt: { gte: since }, turnId: { not: null }, itemId: { not: null } },
    select: { kind: true, itemId: true, turnId: true, similarity: true, weighted: true },
  }))
}

/** Run by memory's daily maintenance: moves the organisation's bars a step, and says whether they changed. */
export async function tuneOrgBars(now = new Date()): Promise<{ changed: boolean; bars: Bars }> {
  const org = await prisma.org.findFirst({ select: { id: true } })
  const bars = await currentBars()
  if (!org) return { changed: false, bars }
  const since = new Date(now.getTime() - TUNING_WINDOW_DAYS * 24 * 60 * 60 * 1000)
  const next = tuneBars(bars, await barSamples(since))
  if (next.certain === bars.certain && next.probable === bars.probable) return { changed: false, bars }
  await prisma.org.update({ where: { id: org.id }, data: { memoryCertainBar: next.certain, memoryProbableBar: next.probable } })
  return { changed: true, bars: next }
}
