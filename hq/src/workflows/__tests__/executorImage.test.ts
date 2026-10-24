import { describe, it, expect, vi } from 'vitest'

vi.mock('wasp/server', () => ({ prisma: {}, HttpError: class extends Error {} }))
vi.mock('../../storage/storageSite', () => ({}))
vi.mock('../imageUpgrade', () => ({}))

import type { SiteHealth } from '@agenthix/core'
import { executorImageChanged, imageOfReport } from '../executorImage'

const A = `sha256:${'a'.repeat(64)}`
const B = `sha256:${'b'.repeat(64)}`
const health = (digest: string | null): SiteHealth => ({
  takenAt: '2026-10-24T10:00:00.000Z', runs: { running: 0, maxAtOnce: 4 }, disk: null, docker: { running: true, version: null },
  agentImage: { name: 'agent', present: true, version: null }, ceilings: null, memoryNearlyFull: false,
  ...(digest ? { executorImage: { name: 'executor', present: true, digest, release: '0.4.0', toolsKey: 'k' } } : {}),
})

describe('the executor image a site reports', () => {
  it('is the digest, release and tools key of an image that is there, and nothing otherwise', () => {
    expect(imageOfReport(health(A).executorImage)).toEqual({ digest: A, release: '0.4.0', toolsKey: 'k' })
    expect(imageOfReport(null)).toBeNull()
    expect(imageOfReport({ name: 'x', present: false, digest: null, release: null, toolsKey: null })).toBeNull()
  })

  it('changes when the digest does, or when there was none before', () => {
    expect(executorImageChanged(health(A), health(A))).toBeNull()
    expect(executorImageChanged(health(A), health(B))?.digest).toBe(B)
    expect(executorImageChanged(null, health(A))?.digest).toBe(A)
    expect(executorImageChanged(health(null), health(A))?.digest).toBe(A)
    expect(executorImageChanged(health(A), health(null))).toBeNull()
  })
})
