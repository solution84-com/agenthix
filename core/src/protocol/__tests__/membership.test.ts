import { describe, it, expect } from 'vitest'
import * as protocol from '../index.js'
import { MEMBERSHIP_METHODS } from '../membership.js'
import { RUNTIME_METHODS } from '../runtimeData.js'
import { SITE_DATA_METHODS } from '../siteData.js'
import { LOCATION_FILE_METHODS } from '../locationFiles.js'
import { SESSION_STATUSES, SESSION_CLOSED_REASONS } from '../sessionState.js'
import { ACTIVE_RUNS_METHOD } from '../activeRuns.js'

describe('the person-scoped execution contract', () => {
  it('names three distinct membership methods that collide with no other channel method', () => {
    const names = Object.values(MEMBERSHIP_METHODS)
    expect(new Set(names).size).toBe(3)
    const others = new Set<string>([
      ...Object.values(RUNTIME_METHODS), ...Object.values(SITE_DATA_METHODS), ...Object.values(LOCATION_FILE_METHODS),
    ])
    for (const name of names) expect(others.has(name)).toBe(false)
  })

  it('adds the active-runs read beside run.list, under its own name', () => {
    expect(ACTIVE_RUNS_METHOD).toBe('run.listActive')
    // Contract report assumption 6: not registered until a site serves it.
    // Lane 4 (task 2.18) registers the handler and moves it into
    // RUNTIME_METHODS at that point — see runtimeData.ts's own RUN_LIST_ACTIVE entry.
    expect(RUNTIME_METHODS.runListActive).toBe(ACTIVE_RUNS_METHOD)
    expect(Object.values(RUNTIME_METHODS)).toContain(ACTIVE_RUNS_METHOD)
  })

  it('adds CLOSED to the session statuses without dropping any', () => {
    expect(SESSION_STATUSES).toEqual(['ACTIVE', 'ARCHIVED', 'CLOSED'])
    expect(SESSION_CLOSED_REASONS).toContain('HARNESS_STATE_MISSING')
  })

  it('is exported from the protocol index', () => {
    expect(protocol.MEMBERSHIP_METHODS).toBe(MEMBERSHIP_METHODS)
    expect(protocol.SESSION_STATUSES).toBe(SESSION_STATUSES)
    expect(protocol.parseCapabilityRunner).toBeTypeOf('function')
  })
})
