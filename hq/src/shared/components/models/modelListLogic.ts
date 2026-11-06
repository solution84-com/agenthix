import { MODEL_LIST_PATTERN_MAX } from '@agenthix/core'
import type { ModelChoice } from '../../conversations/protocol'
import { patternMatches } from '../../../routing/listMatch'

/** How many models of a maker show before *Show N more*. */
export const GROUP_SIZE = 3

/** What the price marks mean, in their tooltip. */
export const PRICE_HINT = 'Price per token, from $ low to $$$ high'

/**
 * One model as the list shows it, whichever place gives it: a picker's choice (a model via one provider) or a list's
 * reachable model (a maker and name, reached by one or more providers).
 */
export type ListModel = {
  /** What choosing it gives back: a picker value (`<providerId>/<model>`) or a list key (`<maker>/<name>`). */
  id: string
  label: string
  maker: string
  /** The providers that reach it, by name, for the Provider filter. */
  providers: string[]
  /** The route under the name, only where it tells two rows or two routes apart; null shows none. */
  route: string | null
  price: 1 | 2 | 3
  notWorking?: boolean
  /** The maker and name, which a pattern matches; absent where the place gives none. */
  key?: string
}

export type ListFilter = { query: string; maker: string; provider: string; price: 0 | 1 | 2 | 3 }

export const NO_FILTER: ListFilter = { query: '', maker: '', provider: '', price: 0 }

export const PRICE_BANDS: { value: ListFilter['price']; label: string }[] = [
  { value: 0, label: 'Any price' }, { value: 1, label: '$ low' }, { value: 2, label: '$$ medium' }, { value: 3, label: '$$$ high' },
]

/** The cost in words, for a person who does not read dollar signs. */
export const costWords = (price: 1 | 2 | 3) => (['Low cost', 'Medium cost', 'High cost'] as const)[price - 1]

const providerOf = (via: string) => via.replace(/^via /, '')

/** A picker's choices as list rows: a model offered through two providers shows its route on each of its rows. */
export function fromChoices(models: readonly ModelChoice[]): ListModel[] {
  const routes = new Map<string, number>()
  const same = (m: ModelChoice) => `${m.maker}\u0000${m.label}`
  for (const m of models) routes.set(same(m), (routes.get(same(m)) ?? 0) + 1)
  return models.map(m => ({
    id: m.value, label: m.label, maker: m.maker, providers: [providerOf(m.via)], price: m.price,
    route: (routes.get(same(m)) ?? 0) > 1 ? m.via : null, ...(m.notWorking && { notWorking: true }),
  }))
}

const matchesQuery = (m: ListModel, q: string) =>
  [m.label, m.id, m.maker, m.key ?? ''].some(part => part.toLowerCase().includes(q))

export function filterModels(models: readonly ListModel[], f: ListFilter): ListModel[] {
  const q = f.query.trim().toLowerCase()
  return models.filter(m =>
    (!f.maker || m.maker === f.maker) &&
    (!f.provider || m.providers.includes(f.provider)) &&
    (!f.price || m.price === f.price) &&
    (!q || matchesQuery(m, q)))
}

export const isFiltered = (f: ListFilter) => f.query.trim() !== '' || f.maker !== '' || f.provider !== '' || f.price !== 0

export const makersOf = (models: readonly ListModel[]) => [...new Set(models.map(m => m.maker))].sort()
export const providersOf = (models: readonly ListModel[]) => [...new Set(models.flatMap(m => m.providers))].sort()

export type ListGroup = { maker: string; shown: ListModel[]; hidden: number }

/** The models grouped by maker in the order given; a filtered list, or an expanded maker, shows all of its models. */
export function groupModels(models: readonly ListModel[], open: boolean, expanded: ReadonlySet<string>): ListGroup[] {
  const byMaker = new Map<string, ListModel[]>()
  for (const m of models) byMaker.set(m.maker, [...(byMaker.get(m.maker) ?? []), m])
  return [...byMaker].map(([maker, all]) => {
    const shown = open || expanded.has(maker) ? all : all.slice(0, GROUP_SIZE)
    return { maker, shown, hidden: all.length - shown.length }
  })
}

export type PatternRow = { pattern: string; covers: number }

const makerPart = (key: string) => key.slice(0, key.indexOf('/'))
const namePart = (key: string) => key.slice(key.indexOf('/') + 1)

/**
 * The pattern what is typed stands for, offered in *many* mode as one row: typed with `*`, it is taken as it is;
 * a maker's name is every model it makes (`deepseek/*`); the start of names that one maker shares is that family
 * (`anthropic/claude-haiku*`); anything else is every name holding it (`*flash*`). Offered when it covers several of
 * the models, or always when the person typed a `*`, so a list can name a maker no provider reaches yet.
 */
export function patternFor(query: string, models: readonly ListModel[]): PatternRow | null {
  const q = query.trim().toLowerCase()
  if (!q || q.length > MODEL_LIST_PATTERN_MAX - 2 || /\s/.test(q)) return null
  const keys = models.flatMap(m => (m.key ? [m.key.toLowerCase()] : []))
  const covers = (pattern: string) => keys.filter(k => patternMatches(pattern, k)).length
  if (q.includes('*')) return { pattern: q, covers: covers(q) }
  let pattern: string
  if (keys.some(k => makerPart(k) === q)) pattern = `${q}/*`
  else if (q.includes('/')) pattern = `${q}*`
  else {
    const makers = new Set(keys.filter(k => namePart(k).startsWith(q)).map(makerPart))
    pattern = makers.size === 1 ? `${[...makers][0]}/${q}*` : `*${q}*`
  }
  const n = covers(pattern)
  return n > 1 ? { pattern, covers: n } : null
}

/** What *Add* says for what is ticked: "Add 2 models", "Add 1 pattern", "Add 1 pattern and 2 models". */
export function addWords(models: number, patterns: number): string {
  const part = (n: number, one: string) => `${n} ${n === 1 ? one : `${one}s`}`
  if (patterns === 0) return `Add ${part(models, 'model')}`
  if (models === 0) return `Add ${part(patterns, 'pattern')}`
  return `Add ${part(patterns, 'pattern')} and ${part(models, 'model')}`
}
