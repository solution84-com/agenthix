import type { ModelChoice } from '../../shared/conversations/protocol'

/** How many models of a maker show before *Show N more*. */
export const GROUP_SIZE = 3

export type PickerGroup = {
  maker: string
  /** The access that reaches the group's models: "via OpenRouter". Several, when they differ. */
  via: string
  shown: ModelChoice[]
  hidden: number
}

export type PickerRows = {
  /** The models recommended here: what this conversation would talk on if nobody picked. */
  recommended: ModelChoice[]
  recent: ModelChoice[]
  groups: PickerGroup[]
  /** What the arrow keys walk, top to bottom: the recommended, the recent, then each group's shown ones. */
  flat: ModelChoice[]
}

const matches = (m: ModelChoice, q: string) =>
  [m.label, m.value, m.maker].some(part => part.toLowerCase().includes(q))

/**
 * The picker's rows for a search text. A search matches any part of a name and lists every match, still grouped,
 * with no Recent; without one, Recent comes first and each maker shows its first few unless the maker is expanded.
 */
export function pickerRows(
  models: ModelChoice[], recent: ModelChoice[], query: string, expanded: ReadonlySet<string>, recommended: ModelChoice[] = [],
): PickerRows {
  const q = query.trim().toLowerCase()
  const searching = q !== ''
  const pool = searching ? models.filter(m => matches(m, q)) : models
  const byMaker = new Map<string, ModelChoice[]>()
  for (const m of pool) byMaker.set(m.maker, [...(byMaker.get(m.maker) ?? []), m])
  const groups: PickerGroup[] = [...byMaker].map(([maker, all]) => {
    const open = searching || expanded.has(maker)
    const shown = open ? all : all.slice(0, GROUP_SIZE)
    return { maker, via: [...new Set(all.map(m => m.via))].join(', '), shown, hidden: all.length - shown.length }
  })
  const best = searching ? [] : recommended
  const top = searching ? [] : recent.filter(r => !best.some(b => b.value === r.value))
  return { recommended: best, recent: top, groups, flat: [...best, ...top, ...groups.flatMap(g => g.shown)] }
}

/** The cost in words, for a person who does not read dollar signs. */
export const costWords = (price: ModelChoice['price']) => (['Low cost', 'Medium cost', 'High cost'] as const)[price - 1]

/** The next highlighted position after an arrow key, wrapping at the ends. */
export function moveHighlight(index: number, key: 'ArrowDown' | 'ArrowUp', count: number): number {
  if (count === 0) return 0
  return key === 'ArrowDown' ? (index + 1) % count : (index - 1 + count) % count
}

/** The label without what the maker's mark already says: "DeepSeek V4.1 Flash" is "V4.1 Flash", "Claude Sonnet 5" is "Sonnet 5". */
export function shortModelName(label: string, maker: string): string {
  let short = label
  for (const prefix of [maker, 'Claude']) {
    if (prefix && short.toLowerCase().startsWith(`${prefix.toLowerCase()} `)) short = short.slice(prefix.length + 1)
  }
  return short.trim() || label
}

const MAKER_MARKS: Record<string, string> = { deepseek: 'DS', anthropic: 'AN', openai: 'OA' }

/** The two letters in the maker's mark: a few makers have their own, any other shows its first two letters. */
export function makerInitials(maker: string): string {
  const known = MAKER_MARKS[maker.trim().toLowerCase()]
  if (known) return known
  return maker.replace(/[^\p{L}\p{N}]/gu, '').slice(0, 2).toUpperCase()
}

export const PICKER_MAX_HEIGHT = 420
export const PICKER_MIN_HEIGHT = 160
const PICKER_GAP = 8

/**
 * Which side of the chip the open picker goes and how tall it may be, so it is never cut off: the preferred side when
 * it has room for the whole list or more room than the other, the other side otherwise. `bounds` is the visible area
 * the picker must stay inside — the window, narrowed by any ancestor that clips its content.
 */
export function pickerPlacement(
  chip: { top: number; bottom: number },
  bounds: { top: number; bottom: number },
  preferAbove: boolean,
): { above: boolean; maxHeight: number } {
  const room = { above: chip.top - bounds.top - PICKER_GAP, below: bounds.bottom - chip.bottom - PICKER_GAP }
  const preferred = preferAbove ? room.above : room.below
  const other = preferAbove ? room.below : room.above
  const above = preferred >= PICKER_MAX_HEIGHT || preferred >= other ? preferAbove : !preferAbove
  const space = above ? room.above : room.below
  return { above, maxHeight: Math.max(PICKER_MIN_HEIGHT, Math.min(PICKER_MAX_HEIGHT, space)) }
}
