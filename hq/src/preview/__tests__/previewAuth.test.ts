// @vitest-environment node
import { describe, it, expect } from 'vitest'

// The door's own logic, with its two reads injected. Who may watch (canAccess,
// against the real location access rule) is previewAccess.integration.test.ts.

import { authorizePreview } from '../previewAuth'

const running = { id: 'p1', token: 'tok', status: 'running', sessionId: 's1', agentId: 'a1' }

describe('authorizePreview @SC-230', () => {
  it('rejects when no user session (401)', async () => {
    const res = await authorizePreview('p1', null, { getById: async () => running as any, canAccess: async () => true })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.code).toBe(401)
  })

  it('rejects an unknown preview (404)', async () => {
    const res = await authorizePreview('nope', { id: 'u1' }, { getById: async () => null, canAccess: async () => true })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.code).toBe(404)
  })

  it('rejects an expired preview (410)', async () => {
    const res = await authorizePreview('p1', { id: 'u1' }, { getById: async () => ({ ...running, status: 'expired' }) as any, canAccess: async () => true })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.code).toBe(410)
  })

  // A preview past its expiry whose site has not yet confirmed the stop. It is
  // over as far as anyone watching is concerned, and must not keep resolving
  // just because the sweep is still chasing the site.
  it('rejects a preview whose stop has not been acknowledged (410)', async () => {
    const res = await authorizePreview('p1', { id: 'u1' }, { getById: async () => ({ ...running, status: 'stopping' }) as any, canAccess: async () => true })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.code).toBe(410)
  })

  it('rejects when requester may not access the owning resource (403)', async () => {
    const res = await authorizePreview('p1', { id: 'u2' }, { getById: async () => running as any, canAccess: async () => false })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.code).toBe(403)
  })

  it('passes for an authorized requester on a running preview', async () => {
    const res = await authorizePreview('p1', { id: 'u1' }, { getById: async () => running as any, canAccess: async () => true })
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.session.id).toBe('p1')
  })
})
