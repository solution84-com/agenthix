import { describe, expect, it } from 'vitest'
import { dropDatabaseStatement, newRunId, runDatabaseNames, withDatabase } from './runDatabases'

describe("a run's own test databases @SC-1252", () => {
  it('are named for the run, end in _test, and differ between runs', () => {
    const a = runDatabaseNames(newRunId())
    const b = runDatabaseNames(newRunId())
    for (const name of [a.hq, a.site]) expect(name).toMatch(/_test$/)
    expect(a.hq).not.toBe(a.site)
    expect(a.hq).not.toBe(b.hq)
    expect(runDatabaseNames('abc123')).toEqual({ hq: 'agenthix_xabc123_test', site: 'agenthix_site_xabc123_test' })
  })

  it('refuse a run id that could reach outside a database name', () => {
    for (const id of ['', 'ab', 'ABC123', 'abc"; DROP', 'abc-123', 'a'.repeat(17)]) {
      expect(() => runDatabaseNames(id)).toThrow(/refusing/)
    }
  })

  it('are dropped only by a name a run makes', () => {
    expect(dropDatabaseStatement('agenthix_xabc123_test')).toBe('DROP DATABASE IF EXISTS "agenthix_xabc123_test" WITH (FORCE)')
    expect(dropDatabaseStatement('agenthix_site_xabc123_test')).toMatch(/agenthix_site_xabc123_test/)
    for (const name of ['agenthix', 'agenthix_test', 'agenthix_site_test', 'agenthix_w1_test', 'agenthix_xabc123', 'x"_test']) {
      expect(() => dropDatabaseStatement(name)).toThrow(/refusing to drop/)
    }
  })

  it('sit on the server of the address they are derived from', () => {
    expect(withDatabase('postgresql://u:p@127.0.0.1:5432/agenthix', 'agenthix_xabc123_test')).toBe(
      'postgresql://u:p@127.0.0.1:5432/agenthix_xabc123_test',
    )
  })
})
