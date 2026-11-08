export type ColumnLike = { name: string; label?: string; order?: number }

/** A board's columns as `getBoards` returns them (stored JSON, sometimes still a string), in column order. */
export function columnsOf(raw: unknown): ColumnLike[] {
  const parsed = typeof raw === 'string' ? (() => { try { return JSON.parse(raw) } catch { return [] } })() : raw
  return Array.isArray(parsed) ? (parsed as ColumnLike[]).slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0)) : []
}
