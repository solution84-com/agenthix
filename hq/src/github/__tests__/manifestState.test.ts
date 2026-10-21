import { describe, it, expect, beforeEach } from 'vitest'
import {
  MANIFEST_STATE_TTL_MS,
  clearManifestStates,
  consumeManifestState,
  isManifestStateOpen,
  issueManifestState,
} from '../manifestState'

beforeEach(() => clearManifestStates())

describe('manifest state store (R-166)', () => {
  it('issues 32 random bytes as base64url, different each time', () => {
    const a = issueManifestState('admin-1')
    const b = issueManifestState('admin-1')
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(Buffer.from(a, 'base64url')).toHaveLength(32)
    expect(a).not.toBe(b)
  })

  it('a state it issued is open, and checking does not use it up', () => {
    const state = issueManifestState('admin-1')
    expect(isManifestStateOpen(state)).toBe(true)
    expect(isManifestStateOpen(state)).toBe(true)
  })

  it('consumes a state once and returns the admin it was issued to', () => {
    const state = issueManifestState('admin-1')
    expect(consumeManifestState(state)).toEqual({ userId: 'admin-1' })
    expect(consumeManifestState(state)).toBeNull()
    expect(isManifestStateOpen(state)).toBe(false)
  })

  it('refuses a state it never issued, and values that are not strings', () => {
    issueManifestState('admin-1')
    expect(isManifestStateOpen('made-up')).toBe(false)
    expect(consumeManifestState('made-up')).toBeNull()
    expect(consumeManifestState(undefined)).toBeNull()
    expect(consumeManifestState(['a'])).toBeNull()
    expect(isManifestStateOpen('')).toBe(false)
  })

  it('a wrong state does not use up a right one', () => {
    const state = issueManifestState('admin-1')
    expect(consumeManifestState('wrong')).toBeNull()
    expect(consumeManifestState(state)).toEqual({ userId: 'admin-1' })
  })

  it('expires after ten minutes', () => {
    const t0 = 1_000_000
    const state = issueManifestState('admin-1', t0)
    expect(MANIFEST_STATE_TTL_MS).toBe(10 * 60 * 1000)
    expect(isManifestStateOpen(state, t0 + MANIFEST_STATE_TTL_MS - 1)).toBe(true)
    expect(isManifestStateOpen(state, t0 + MANIFEST_STATE_TTL_MS)).toBe(false)
    expect(consumeManifestState(state, t0 + MANIFEST_STATE_TTL_MS)).toBeNull()
  })

  it('sweeps expired entries when the next state is issued', () => {
    const t0 = 1_000_000
    const old = issueManifestState('admin-1', t0)
    const fresh = issueManifestState('admin-2', t0 + MANIFEST_STATE_TTL_MS + 1)
    expect(consumeManifestState(old, t0)).toBeNull()
    expect(consumeManifestState(fresh, t0 + MANIFEST_STATE_TTL_MS + 1)).toEqual({ userId: 'admin-2' })
  })
})
