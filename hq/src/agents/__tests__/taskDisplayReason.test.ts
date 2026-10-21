import { describe, it, expect } from 'vitest'
import { displayRunStateReason } from '../taskDisplayReason'
import { HELD_FOR_RECONNECT_REASON, SITE_REVOKED_REASON } from '../taskExecutionReasons'

const HELD = { runState: 'RUN_QUEUED', runStateReason: HELD_FOR_RECONNECT_REASON }

describe('displayRunStateReason — R-033', () => {
  it('says a task held for a site with a version mismatch waits for an upgrade, not a reconnect', () => {
    const shown = displayRunStateReason(HELD, 'VERSION_MISMATCH')
    expect(shown).toMatch(/upgrad/i)
    expect(shown).not.toMatch(/reconnect/i)
  })

  it.each(['OFFLINE', 'ONLINE', 'REGISTERED', null, undefined])('keeps the stored reason for a held task on a site that is %s', (status) => {
    expect(displayRunStateReason(HELD, status)).toBe(HELD_FOR_RECONNECT_REASON)
  })

  it('never rewrites a reason that is not the held one, whatever the site says', () => {
    expect(displayRunStateReason({ runState: 'RUN_FAILED', runStateReason: SITE_REVOKED_REASON }, 'VERSION_MISMATCH')).toBe(SITE_REVOKED_REASON)
  })

  it('does not rewrite the held reason on a task that has moved on from QUEUED', () => {
    expect(displayRunStateReason({ runState: 'RUN_ACTIVE', runStateReason: HELD_FOR_RECONNECT_REASON }, 'VERSION_MISMATCH')).toBe(HELD_FOR_RECONNECT_REASON)
  })

  it('passes a null reason through', () => {
    expect(displayRunStateReason({ runState: 'RUN_NONE', runStateReason: null }, 'VERSION_MISMATCH')).toBeNull()
  })

  it('the stored string the drain, claim, re-hold and sweep match on is unchanged', () => {
    expect(HELD_FOR_RECONNECT_REASON).toBe('site unreachable — held for reconnect')
  })
})
