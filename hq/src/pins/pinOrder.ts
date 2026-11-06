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
