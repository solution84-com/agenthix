/** The bulk selection's filters (models from one place, part 4): a one-time selection, never a rule that moves with prices. */
import type { ReachableModel } from '../types'

export type BulkFilter = { maker: string; provider: string; minPrice: 0 | 1 | 2 | 3; search: string }

export const NO_FILTER: BulkFilter = { maker: '', provider: '', minPrice: 0, search: '' }

export function filterModels(models: readonly ReachableModel[], f: BulkFilter): ReachableModel[] {
  const q = f.search.trim().toLowerCase()
  return models.filter(m =>
    (!f.maker || m.maker === f.maker) &&
    (!f.provider || m.via.includes(f.provider)) &&
    m.price >= f.minPrice &&
    (!q || m.label.toLowerCase().includes(q) || m.key.includes(q)))
}

export const makersOf = (models: readonly ReachableModel[]) => [...new Set(models.map(m => m.maker))].sort()
export const providersOf = (models: readonly ReachableModel[]) => [...new Set(models.flatMap(m => m.via))].sort()

export const PRICE_BANDS: { value: 0 | 1 | 2 | 3; label: string }[] = [
  { value: 0, label: 'Any price' }, { value: 2, label: '$$ and above' }, { value: 3, label: '$$$ and above' },
]
