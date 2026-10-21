import { costBand, COST_BAND_MARKERS, type ModelPreset, type OpenCodeModel } from '@agenthix/core'

/** The option text of a model: its name and its relative price band. */
export function modelOptionLabel(m: ModelPreset): string {
  return `${m.label} · ${COST_BAND_MARKERS[costBand(m.costRank)]}`
}

/** Models whose name, price marker, provider or id contains every word of the query. An empty query keeps them all. */
export function filterModels<T extends ModelPreset & { provider?: string }>(models: readonly T[], query: string): T[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  return models.filter(m => {
    const haystack = `${modelOptionLabel(m)} ${m.provider ?? ''} ${m.value}`.toLowerCase()
    return words.every(w => haystack.includes(w))
  })
}

/**
 * A catalogue grouped by provider, in the order the providers first appear.
 * Inside a group the free models come first, then dearer ones, each band in the
 * catalogue's own name order; OpenRouter alone has over a hundred.
 */
export function groupByProvider(models: readonly OpenCodeModel[]): [string, OpenCodeModel[]][] {
  const groups = new Map<string, OpenCodeModel[]>()
  for (const m of models) groups.set(m.provider, [...(groups.get(m.provider) ?? []), m])
  return [...groups.entries()].map(([provider, group]) => [
    provider,
    group.map((m, i) => ({ m, i })).sort((a, b) => a.m.costRank - b.m.costRank || a.i - b.i).map(x => x.m),
  ])
}
