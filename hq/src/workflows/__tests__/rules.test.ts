import { describe, expect, it } from 'vitest'
import {
  afterApproval, beyondOwnStorageLimit, mayApproveVersion, mayDeclineVersion, mayDecideVersion, maySwitch, type VersionFacts,
} from '../rules'

const HASH = 'a'.repeat(64)
const waiting = (over: Partial<VersionFacts> = {}): VersionFacts => ({
  state: 'PROPOSED', number: 2, hash: HASH, checked: true, cardMayApprove: false, ...over,
})

describe('who approves', () => {
  it('needs the place\'s administrators', () => {
    expect(mayDecideVersion({ placeType: 'project', administers: true, isOrgAdmin: false, github: {} }, 'approve')).toEqual({ ok: true })
    const refused = mayDecideVersion({ placeType: 'project', administers: false, isOrgAdmin: true, github: {} }, 'approve')
    expect(refused).toMatchObject({ ok: false, status: 403 })
    expect(refused.ok || refused.message).toContain('administrators')
    expect(refused.ok || refused.message).toMatch(/Nothing was changed\.$/)
  })

  it('in a person\'s own storage, allows contents and pull requests only', () => {
    const own = { placeType: 'user' as const, administers: true, isOrgAdmin: false }
    expect(mayDecideVersion({ ...own, github: { contents: 'write', pull_requests: 'write', metadata: 'read' } }, 'approve').ok).toBe(true)
    const wider = mayDecideVersion({ ...own, github: { contents: 'write', workflows: 'write', secrets: 'write' } }, 'approve')
    expect(wider).toMatchObject({ ok: false, status: 403 })
    expect(wider.ok || wider.message).toContain('secrets, workflows')
    expect(wider.ok || wider.message).toContain('organisation administrator')
  })

  it('lets an organisation administrator approve wider permissions in their own storage', () => {
    expect(mayDecideVersion({ placeType: 'user', administers: true, isOrgAdmin: true, github: { administration: 'write' } }, 'approve').ok).toBe(true)
  })

  it('applies the GitHub limit to approving, not to declining', () => {
    expect(mayDecideVersion({ placeType: 'user', administers: true, isOrgAdmin: false, github: { actions: 'write' } }, 'decline').ok).toBe(true)
  })

  it('names what goes beyond the own-storage limit', () => {
    expect(beyondOwnStorageLimit({ contents: 'read', pull_requests: 'write' })).toEqual([])
    expect(beyondOwnStorageLimit({ actions: 'read', contents: 'write', administration: 'write' })).toEqual(['actions', 'administration'])
  })
})

describe('approving by hash', () => {
  it('approves the waiting version named by its own hash', () => {
    expect(mayApproveVersion(waiting(), HASH, 1, 'review')).toEqual({ ok: true })
  })

  it('refuses any other hash: a person approves what they were shown', () => {
    expect(mayApproveVersion(waiting(), 'b'.repeat(64), 1, 'review')).toMatchObject({ ok: false, status: 409 })
  })

  it('refuses a version that isn\'t waiting', () => {
    for (const state of ['APPROVED', 'DECLINED', 'SUPERSEDED'] as const) {
      expect(mayApproveVersion(waiting({ state }), HASH, null, 'review').ok).toBe(false)
    }
  })

  it('refuses a version older than the approved one', () => {
    expect(mayApproveVersion(waiting({ number: 2 }), HASH, 3, 'review')).toMatchObject({ ok: false })
  })

  it('refuses until the plain checks have run', () => {
    expect(mayApproveVersion(waiting({ checked: false }), HASH, null, 'review').ok).toBe(false)
  })

  it('approves from the card only when the plain checks allow it', () => {
    expect(mayApproveVersion(waiting({ cardMayApprove: false }), HASH, null, 'card').ok).toBe(false)
    expect(mayApproveVersion(waiting({ cardMayApprove: null }), HASH, null, 'card').ok).toBe(false)
    expect(mayApproveVersion(waiting({ cardMayApprove: true }), HASH, null, 'card').ok).toBe(true)
  })

  it('declines only a waiting version, by its hash', () => {
    expect(mayDeclineVersion(waiting(), HASH).ok).toBe(true)
    expect(mayDeclineVersion(waiting(), 'c'.repeat(64)).ok).toBe(false)
    expect(mayDeclineVersion(waiting({ state: 'APPROVED' }), HASH).ok).toBe(false)
  })
})

describe('superseding', () => {
  const others = [
    { id: 'v1', number: 1, state: 'SUPERSEDED' as const },
    { id: 'v2', number: 2, state: 'APPROVED' as const },
    { id: 'v3', number: 3, state: 'PROPOSED' as const },
    { id: 'v4', number: 4, state: 'DECLINED' as const },
    { id: 'v6', number: 6, state: 'PROPOSED' as const },
  ]

  it('supersedes the approved version and older waiting ones, and leaves newer waiting ones', () => {
    expect(afterApproval(5, others, true)).toEqual({ supersede: ['v2', 'v3'], turnOn: false })
  })

  it('turns the workflow on with its first approval only', () => {
    expect(afterApproval(1, [], false).turnOn).toBe(true)
    expect(afterApproval(3, others, true).turnOn).toBe(false)
  })
})

describe('the switch', () => {
  it('turns on only with an approved version, and needs no new approval', () => {
    expect(maySwitch(true, true)).toEqual({ ok: true })
    expect(maySwitch(true, false)).toMatchObject({ ok: false, status: 409 })
  })

  it('always turns off', () => {
    expect(maySwitch(false, false)).toEqual({ ok: true })
  })
})
