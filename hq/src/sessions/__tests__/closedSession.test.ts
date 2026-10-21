import { describe, it, expect } from 'vitest'
import { isSessionClosed, requireOpenSession } from '../closedSession'

// The closed-conversation rule itself (adr-0076). What the session operations
// do with it is in closedSession.integration.test.ts.
describe('a closed conversation', () => {
  it('counts as closed from its reason alone, after it has been archived', () => {
    expect(isSessionClosed({ status: 'ARCHIVED', closedReason: 'HARNESS_STATE_MISSING' })).toBe(true)
    expect(isSessionClosed({ status: 'ACTIVE', closedReason: null })).toBe(false)
    expect(() => requireOpenSession({ status: 'CLOSED', closedReason: 'LEFT_PROJECT' }))
      .toThrow('you are no longer a member of its project')
  })
})
