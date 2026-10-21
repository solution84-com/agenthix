/** The ids in their new order once `movedId` is dropped where `targetId` was; unchanged when either is unknown. */
export function movedOrder(ids: string[], movedId: string, targetId: string): string[] {
  const from = ids.indexOf(movedId)
  const to = ids.indexOf(targetId)
  if (from === -1 || to === -1 || from === to) return ids
  const next = [...ids]
  next.splice(from, 1)
  next.splice(to, 0, movedId)
  return next
}

/**
 * The pin the current page belongs to: the one whose link is the longest prefix
 * of the path, so a pinned board wins over its pinned project while the board is
 * open. A prefix must end at a path segment, so /projects/AG is not /projects/AGX.
 */
export function activePinId(items: { id: string; href: string }[], pathname: string): string | null {
  let best: { id: string; length: number } | null = null
  for (const item of items) {
    const within = pathname === item.href || pathname.startsWith(`${item.href}/`)
    if (within && (!best || item.href.length > best.length)) best = { id: item.id, length: item.href.length }
  }
  return best?.id ?? null
}

/**
 * The pin the foot's row shows: the one used most recently that isn't where the person is, else the first pin
 * that isn't. Only when the one pin is the current place does the row show it.
 */
export function rowPinId(items: { id: string }[], recent: string[], activeId: string | null): string | null {
  const here = (id: string) => id === activeId
  const known = new Set(items.map((i) => i.id))
  const used = recent.find((id) => known.has(id) && !here(id))
  return used ?? items.find((i) => !here(i.id))?.id ?? items[0]?.id ?? null
}
