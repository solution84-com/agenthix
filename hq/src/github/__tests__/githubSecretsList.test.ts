import { describe, it, expect, vi } from 'vitest'

vi.mock('wasp/server', () => ({ prisma: {} }))
vi.mock('../repoApi', () => ({ withRepoApi: vi.fn() }))

import { ENVIRONMENT_SECRET_NOTE, REPOSITORY_SECRET_NOTE, markSecrets } from '../githubSecrets'

describe('secrets on GitHub, by name', () => {
  it('lists every repository secret as outside HQ, and an environment secret as from Secrets only when the approved version sets it', () => {
    const items = markSecrets(
      { secrets: [{ name: 'LEGACY_TOKEN', updated_at: '2026-10-01T00:00:00Z' }] },
      { secrets: [{ name: 'DEPLOY_KEY', updated_at: '2026-10-02T00:00:00Z' }, { name: 'HAND_SET', updated_at: '2026-10-03T00:00:00Z' }] },
      new Set(['DEPLOY_KEY']),
    )
    expect(items).toEqual([
      { name: 'DEPLOY_KEY', updatedAt: '2026-10-02T00:00:00Z', environment: 'production', fromHq: true, note: null },
      { name: 'HAND_SET', updatedAt: '2026-10-03T00:00:00Z', environment: 'production', fromHq: false, note: ENVIRONMENT_SECRET_NOTE },
      { name: 'LEGACY_TOKEN', updatedAt: '2026-10-01T00:00:00Z', environment: null, fromHq: false, note: REPOSITORY_SECRET_NOTE },
    ])
  })

  it('a repository secret is never from Secrets, even under a name HQ sets', () => {
    expect(markSecrets({ secrets: [{ name: 'DEPLOY_KEY', updated_at: 'x' }] }, null, new Set(['DEPLOY_KEY']))[0].fromHq).toBe(false)
  })
})
