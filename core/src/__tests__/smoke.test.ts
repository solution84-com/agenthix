import { describe, it, expect } from 'vitest'
import { TASK_STATUSES } from '../shared/status.js'
import { SITE_PROTOCOL_VERSION } from '../protocol/connection.js'

// Phase 3 bootstrap smoke test: proves the vitest runner resolves and can
// import core's source. Phase 5 adds the per-module coverage against
// docs/work/qa/scenarios/core.md; this can stay as a cheap toolchain check.
describe('core runner smoke', () => {
  it('imports runtime exports from source', () => {
    expect(TASK_STATUSES).toEqual(['todo', 'in_progress', 'done'])
    // Not pinned to a number here — this test exists to prove the runner
    // resolves core's source. The version's actual value is the protocol's
    // own contract, asserted in protocol/__tests__/connection.test.ts, and
    // pinning it twice makes every bump trip a test that is not about it.
    expect(SITE_PROTOCOL_VERSION).toMatch(/^\d+\.\d+$/)
  })
})
