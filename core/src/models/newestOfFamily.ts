import type { AiProviderVendor } from '../providers/providers.js'
import { COST_BAND_MAX_RANKS } from './openCodeModels.generated.js'
import { DEFAULT_FAMILY_OF, MODEL_FAMILIES, type ModelFamilyId } from './modelFamilies.js'
import { makerAndName } from './modelIdentity.js'

/** A model a provider reaches: its id as the provider names it. `releasedAt` (ISO date) is used when the catalogue has it. */
export type CatalogueModel = { model: string; label: string; costRank: number | null; releasedAt?: string }

export type ChosenModel = { model: string | null; family: ModelFamilyId | null; fellBack: boolean }

const DATE_SUFFIX = /-\d{8}$/
const PREVIEW = /preview/
/** Specialised variants never a default; the family patterns exclude most already, this is the second guard. */
const SPECIALISED = /(?:^|[-/])(?:mini|nano|codex|deep-research|computer-use|image|audio|tts|embedding|realtime|live|customtools|spark)(?:$|-)/

type Candidate = { entry: CatalogueModel; key: string; version: number[]; alias: boolean; preview: boolean; dated: boolean }

function candidateOf(vendor: AiProviderVendor, entry: CatalogueModel, pattern: RegExp): Candidate | null {
  const full = makerAndName(vendor, entry.model).toLowerCase().replace(/\./g, '-')
  const dated = DATE_SUFFIX.test(full)
  const key = full.replace(DATE_SUFFIX, '')
  if (!pattern.test(key) || SPECIALISED.test(key)) return null
  const name = key.slice(key.indexOf('/') + 1)
  const alias = name.includes('latest')
  const version = alias ? [] : (name.match(/\d+/g) ?? []).map(Number)
  return { entry, key, version, alias, preview: PREVIEW.test(key), dated }
}

function compareVersions(a: number[], b: number[]): number {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0)
    if (d !== 0) return d
  }
  return 0
}

/**
 * A positive number when `a` is newer than `b`. When every candidate has a release date, the later date wins, then the
 * higher version. When any candidate lacks one (a list with no dates, or a mix), the version read from the name comes
 * first and the date only separates equal versions, so an undated higher version is never placed below a dated lower
 * one. Last, the shorter id wins: the plain name over a copy with a suffix.
 */
function newer(a: Candidate, b: Candidate, byDate: boolean): number {
  const date = () => (a.entry.releasedAt && b.entry.releasedAt ? a.entry.releasedAt.localeCompare(b.entry.releasedAt) : 0)
  const order = byDate ? [date, () => compareVersions(a.version, b.version)] : [() => compareVersions(a.version, b.version), date]
  for (const step of order) {
    const d = step()
    if (d !== 0) return d
  }
  return b.entry.model.length - a.entry.model.length
}

/**
 * Today's price-band rule, the safety net: the dearest model of the middle band, falling back to the nearest band the
 * provider has. No catalogued price, no pick.
 */
function byPriceBand(catalogue: readonly CatalogueModel[]): string | null {
  const ranked = catalogue.filter((m): m is CatalogueModel & { costRank: number } => m.costRank !== null)
  const { low, mid } = COST_BAND_MAX_RANKS
  const inBand = (from: number, to: number) => ranked.filter(m => m.costRank > from && m.costRank <= to)
  const dearest = (xs: typeof ranked) => xs.reduce<typeof ranked[number] | null>((a, m) => (!a || m.costRank > a.costRank ? m : a), null)
  const cheapest = (xs: typeof ranked) => xs.reduce<typeof ranked[number] | null>((a, m) => (!a || m.costRank < a.costRank ? m : a), null)
  const pick = dearest(inBand(low, mid)) ?? dearest(ranked.filter(m => m.costRank <= low)) ?? cheapest(ranked.filter(m => m.costRank > mid))
  return pick?.model ?? null
}

/**
 * The newest stable model of a family among those a provider reaches. A vendor's own `latest` alias wins where there is
 * one; a model listed both dated and undated counts once, as the undated; a preview is chosen only when no stable model
 * of the family exists. A family with no match, or a vendor with none, falls back to the price-band rule and says so.
 */
export function newestOfFamily(vendor: AiProviderVendor, familyId: ModelFamilyId | null, catalogue: readonly CatalogueModel[]): ChosenModel {
  const family = familyId ? MODEL_FAMILIES[familyId] : null
  if (family) {
    const seen = new Map<string, Candidate>()
    for (const entry of catalogue) {
      const c = candidateOf(vendor, entry, family.pattern)
      if (!c) continue
      const kept = seen.get(c.key)
      if (!kept || (kept.dated && !c.dated)) seen.set(c.key, c)
    }
    const all = [...seen.values()]
    const stable = all.filter(c => !c.preview)
    const pool = stable.length > 0 ? stable : all
    const aliases = pool.filter(c => c.alias)
    const candidates = aliases.length > 0 ? aliases : pool
    const byDate = candidates.length > 0 && candidates.every(c => c.entry.releasedAt)
    const best = candidates.reduce<Candidate | null>((a, c) => (!a || newer(c, a, byDate) > 0 ? c : a), null)
    if (best) return { model: best.entry.model, family: family.id as ModelFamilyId, fellBack: false }
  }
  return { model: byPriceBand(catalogue), family: null, fellBack: true }
}

/** The default model of a vendor: the newest of its named family, or the price-band fallback. */
export function defaultModelOf(vendor: AiProviderVendor, catalogue: readonly CatalogueModel[]): ChosenModel {
  return newestOfFamily(vendor, DEFAULT_FAMILY_OF[vendor] ?? null, catalogue)
}
