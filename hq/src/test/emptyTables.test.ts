import { describe, it, expect } from 'vitest'
import { childrenFirst, emptyStatement } from './emptyTables'

describe('childrenFirst', () => {
  it('orders every table after each table that references it', () => {
    const order = childrenFirst(['User', 'Project', 'Task', 'Tag'], [
      { child: 'Task', parent: 'Project' },
      { child: 'Project', parent: 'User' },
      { child: 'Task', parent: 'User' },
    ])
    expect(order).not.toBeNull()
    expect(order!.slice().sort()).toEqual(['Project', 'Tag', 'Task', 'User'])
    const at = (name: string) => order!.indexOf(name)
    expect(at('Task')).toBeLessThan(at('Project'))
    expect(at('Project')).toBeLessThan(at('User'))
  })

  it('lets a table reference itself — one DELETE removes all its rows together', () => {
    expect(childrenFirst(['Folder'], [{ child: 'Folder', parent: 'Folder' }])).toEqual(['Folder'])
  })

  it('gives no order when the references form a cycle', () => {
    expect(
      childrenFirst(['A', 'B', 'C'], [
        { child: 'A', parent: 'B' },
        { child: 'B', parent: 'A' },
      ])
    ).toBeNull()
  })

  it('ignores a reference to a table outside the list', () => {
    expect(childrenFirst(['A'], [{ child: 'A', parent: '_prisma_migrations' }])).toEqual(['A'])
  })
})

describe('emptyStatement', () => {
  it('deletes from each table in the given order and restarts each sequence, in one statement', () => {
    const sql = emptyStatement(['Task', 'User'], ['Held_sequence_seq'])
    expect(sql.startsWith('DO $$ BEGIN')).toBe(true)
    expect(sql.indexOf('DELETE FROM "public"."Task"')).toBeLessThan(sql.indexOf('DELETE FROM "public"."User"'))
    expect(sql).toContain(`PERFORM setval('"public"."Held_sequence_seq"', 1, false);`)
    expect(sql.trimEnd().endsWith('END $$')).toBe(true)
  })

  it('quotes names so none can end the statement early', () => {
    const sql = emptyStatement(['We"ird'], [`O'Brien`])
    expect(sql).toContain('DELETE FROM "public"."We""ird"')
    expect(sql).toContain(`setval('"public"."O''Brien"', 1, false)`)
  })
})
