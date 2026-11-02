import { describe, it, expect, beforeEach, vi } from 'vitest'
import { serviceDeclarationHash, type ServiceDeclaration } from '@agenthix/core'

vi.mock('#db', () => ({ prisma: {} }))

import { approveService, ensurePreviewServices, resetPreviewServicesForTests, WAITING, type ServicesDeps } from '../previewServices'
import { memoryServiceApprovals, type ServiceApprovals } from '../serviceApprovals'
import type { ServiceDocker } from '../serviceDocker'

const redis = (image = 'redis:7-alpine'): ServiceDeclaration => ({
  name: 'redis', image, command: null, environment: [], expose: [6379], healthcheck: null, dependsOn: [], volume: null,
})

const lp = { id: 'lp1', workspaceId: 'w1', personId: 'p1', projectId: null, hostDir: '/copy' }

function depsWith(approvals: ServiceApprovals, declared: ServiceDeclaration[]): ServicesDeps {
  return {
    docker: {} as ServiceDocker,
    read: async () => ({ kind: 'declared', services: declared }),
    joinPreview: async () => undefined,
    // No budget for services: an approved service gets past the question and fails at its start, which tells the
    // two apart without Docker.
    pool: () => null,
    tell: () => undefined,
    approvals,
    now: () => 0,
    sleep: async () => undefined,
  }
}

const stateOf = async (deps: ServicesDeps) => {
  const ensured = await ensurePreviewServices(lp, deps)
  if (!ensured.ok) throw new Error('refused')
  return ensured.services[0]
}

describe('a service\'s yes @SC-1742', () => {
  beforeEach(() => resetPreviewServicesForTests())

  it('is asked for a declaration nobody approved', async () => {
    const s = await stateOf(depsWith(memoryServiceApprovals(), [redis()]))
    expect(s.state).toBe('waiting')
    expect(s.detail).toBe(WAITING)
  })

  it('survives the site restarting: only what the store holds decides', async () => {
    const store = memoryServiceApprovals()
    const deps = depsWith(store, [redis()])
    await expect(approveService(lp, 'redis', await serviceDeclarationHash(redis()), deps)).resolves.toEqual({ ok: true })
    resetPreviewServicesForTests()
    const s = await stateOf(deps)
    expect(s.state).not.toBe('waiting')
  })

  it('is asked again for a changed declaration, and an earlier approved one stays approved', async () => {
    const store = memoryServiceApprovals()
    await store.approve('w1', 'redis', await serviceDeclarationHash(redis()))
    expect((await stateOf(depsWith(store, [redis('redis:8-alpine')]))).state).toBe('waiting')
    resetPreviewServicesForTests()
    expect((await stateOf(depsWith(store, [redis()]))).state).not.toBe('waiting')
  })

  it('is the workspace\'s own, and goes with it', async () => {
    const store = memoryServiceApprovals()
    await store.approve('w2', 'redis', await serviceDeclarationHash(redis()))
    expect((await stateOf(depsWith(store, [redis()]))).state).toBe('waiting')
    await store.approve('w1', 'redis', await serviceDeclarationHash(redis()))
    await store.forgetWorkspace('w1')
    resetPreviewServicesForTests()
    expect((await stateOf(depsWith(store, [redis()]))).state).toBe('waiting')
  })
})
