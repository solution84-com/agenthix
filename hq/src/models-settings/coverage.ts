/**
 * What a list's entries cover (models from one place, part 4), counted against the models the providers reach: a
 * pattern is never a surprise, because the editor says how many models it reaches today. Pure: the reads that feed
 * it are in `modelLists.ts`.
 */
import { costBand, type AiProviderVendor, type ModelListEntry } from '@agenthix/core'
import { allowedByLists, patternMatches, type AppliedList } from '../routing/listMatch'
import { makerAndName, modelsReachedBy, sameModelKey } from '../routing/modelKeys'
import type { ListEntryView, ReachableModel } from './types'

const MAKER_LABELS: Record<string, string> = {
  anthropic: 'Anthropic', openai: 'OpenAI', google: 'Google', deepseek: 'DeepSeek', qwen: 'Qwen', mistralai: 'Mistral',
  'z-ai': 'Z.ai', 'x-ai': 'xAI', meta: 'Meta', 'meta-llama': 'Meta', moonshotai: 'Moonshot AI', nvidia: 'NVIDIA',
}

/** Who makes a model, for grouping and words: from its maker and name. */
export function makerLabel(key: string): string {
  const maker = key.split('/')[0]
  return MAKER_LABELS[maker] ?? maker.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
}

export function priceOf(costRank: number | null): 1 | 2 | 3 {
  const band = costRank === null ? 'free' : costBand(costRank)
  return band === 'high' ? 3 : band === 'mid' ? 2 : 1
}

type Reaching = { name: string; vendor: AiProviderVendor }

/** Every model the providers reach, once each: a model two providers reach lists both. */
export function reachableModels(providers: readonly Reaching[]): ReachableModel[] {
  const byKey = new Map<string, ReachableModel>()
  for (const p of providers) {
    for (const m of modelsReachedBy(p.vendor)) {
      const key = makerAndName(p.vendor, m.model).toLowerCase()
      const same = sameModelKey(p.vendor, m.model)
      const known = byKey.get(same)
      if (known) {
        if (!known.via.includes(p.name)) known.via.push(p.name)
        continue
      }
      byKey.set(same, { key, label: m.label, maker: makerLabel(key), via: [p.name], price: priceOf(m.costRank) })
    }
  }
  return [...byKey.values()]
}

export function entryKind(pattern: string): ListEntryView['kind'] {
  if (!pattern.includes('*')) return 'model'
  if (/^\*+$/.test(pattern)) return 'everything'
  return /^[^*/]+\/\*$/.test(pattern) ? 'maker' : 'family'
}

function meaningOf(pattern: string, kind: ListEntryView['kind']): string {
  if (kind === 'everything') return 'Every model'
  if (kind === 'maker') return `Every model made by ${makerLabel(pattern)}`
  if (kind === 'family') return `Every model matching ${pattern}`
  return 'One model'
}

export function viewEntries(entries: readonly ModelListEntry[], reachable: readonly ReachableModel[]): ListEntryView[] {
  return entries.map(e => ({
    effect: e.effect, pattern: e.pattern, kind: entryKind(e.pattern), meaning: meaningOf(e.pattern, entryKind(e.pattern)),
    covers: reachable.filter(m => patternMatches(e.pattern, m.key)).length,
  }))
}

export function countAllowed(lists: readonly AppliedList[], reachable: readonly ReachableModel[]): number {
  return reachable.filter(m => allowedByLists(lists, m.key)).length
}

/** An entry as the editor accepts it: trimmed, one word, no longer than a pattern may be. */
export function cleanPattern(raw: unknown, max: number): string | null {
  if (typeof raw !== 'string') return null
  const pattern = raw.trim()
  if (pattern === '' || pattern.length > max || /\s/.test(pattern)) return null
  return pattern
}

/** One pattern once: a ban beats an allow of the same pattern, and case is not a difference. */
export function dedupeEntries(entries: readonly ModelListEntry[]): ModelListEntry[] {
  const byPattern = new Map<string, ModelListEntry>()
  for (const e of entries) {
    const key = e.pattern.toLowerCase()
    const known = byPattern.get(key)
    if (!known || (known.effect === 'allow' && e.effect === 'never')) byPattern.set(key, e)
  }
  return [...byPattern.values()]
}
