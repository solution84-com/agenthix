import { describe, it, expect } from 'vitest'
import { runOnBehalfOf } from '../sharedSessions.js'

describe('shared task sessions @SC-520', () => {
  it("reads the run's person off its dispatch blob, and nothing else", () => {
    expect(runOnBehalfOf({ dispatch: { kind: 'chat', startedBy: 'person', onBehalfOfUserId: 'u1' } })).toBe('u1')
    expect(runOnBehalfOf({ dispatch: { kind: 'task', startedBy: 'pulse' } })).toBeNull()
    expect(runOnBehalfOf({ dispatch: { onBehalfOfUserId: '' } })).toBeNull()
    expect(runOnBehalfOf({ dispatch: { onBehalfOfUserId: 42 } })).toBeNull()
    expect(runOnBehalfOf({ onBehalfOfUserId: 'u1' })).toBeNull()
    expect(runOnBehalfOf(null)).toBeNull()
    expect(runOnBehalfOf('u1')).toBeNull()
  })
})
