// Empties every table before each integration test (ADR-0035) with one DELETE
// per table, in a single round trip. TRUNCATE gives every table and index new
// files on disk, which costs about 110 ms for hq's tables on every test — most
// of the suite's time — while a DELETE from a small or empty table costs next to
// nothing. The DELETEs run children before parents, so no foreign key ever
// refuses one; when the keys form a cycle there is no such order, and the
// caller truncates instead.

export interface ForeignKey {
  child: string
  parent: string
}

export function childrenFirst(tables: string[], keys: ForeignKey[]): string[] | null {
  const known = new Set(tables)
  const referencedBy = new Map(tables.map((t) => [t, new Set<string>()]))
  for (const { child, parent } of keys) {
    if (child !== parent && known.has(child) && known.has(parent)) referencedBy.get(parent)!.add(child)
  }
  const order: string[] = []
  const placed = new Set<string>()
  while (order.length < tables.length) {
    const ready = tables.filter((t) => !placed.has(t) && [...referencedBy.get(t)!].every((c) => placed.has(c)))
    if (ready.length === 0) return null
    for (const t of ready) {
      order.push(t)
      placed.add(t)
    }
  }
  return order
}

const identifier = (name: string) => `"public"."${name.replace(/"/g, '""')}"`

export function emptyStatement(order: string[], sequences: string[]): string {
  const deletes = order.map((t) => `DELETE FROM ${identifier(t)};`)
  // What TRUNCATE ... RESTART IDENTITY did: the next value drawn is 1 again.
  const restarts = sequences.map((s) => `PERFORM setval('${identifier(s).replace(/'/g, "''")}', 1, false);`)
  return ['DO $$ BEGIN', ...deletes, ...restarts, 'END $$'].join('\n')
}
