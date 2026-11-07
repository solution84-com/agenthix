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
