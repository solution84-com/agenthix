/**
 * What the runtime store does with the site it is asked to reach, against the
 * real test DB: a channel failure becomes a `SiteUnreachableError` naming the
 * site from its registry row, a revoked site is refused before anything is
 * sent, and a run's packages are delivered before the run itself. The channel
 * and the package delivery are replaced, so what was sent and in what order can
 * be read back. The wire format of every method is in siteRuntimeStore.test.ts.
 */
import { describe, it, expect, vi } from 'vitest'
import { RUNTIME_METHODS, type RunPackages } from '@agenthix/core'
import { prisma } from '../../test/db'

const request = vi.hoisted(() => vi.fn())
vi.mock('../../sites/channel', async () => {
  const { ChannelRequestFailed } = await import('../../sites/channel/pendingRequests')
  return { siteChannelRegistry: { request }, ChannelRequestFailed }
})
const deliverPackages = vi.hoisted(() => vi.fn(async () => {}))
vi.mock('../../packages/packageDelivery', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../packages/packageDelivery')>()),
  deliverPackages,
}))
vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<any>('wasp/server')
  const { prisma } = await import('../../test/db')
  return { ...actual, prisma }
})

import { ChannelRequestFailed } from '../../sites/channel/pendingRequests'
import { PackageDeliveryError } from '../../packages/packageDelivery'
import { SiteUnreachableError } from '../../storage/workspaceStore'
import { getRun, listRuns, listActiveRuns, dispatchRun, replaceRequest } from '../siteRuntimeStore'

const SITE = 'site-logical-1'

async function registered(status: string, protocolVersion: string | null = null) {
  request.mockReset()
  deliverPackages.mockReset().mockResolvedValue(undefined)
  await prisma.executionSite.create({ data: { siteId: SITE, label: 'Box One', status, protocolVersion } })
}

describe('site-unreachable mapping @SC-338', () => {
  it.each(['offline', 'timeout', 'disconnected'] as const)('%s becomes a SiteUnreachableError naming the site by its label', async (code) => {
    await registered('OFFLINE')
    request.mockRejectedValue(new ChannelRequestFailed('not reachable', code))

    const err = await getRun(SITE, 'r1').catch((e) => e)

    expect(err).toBeInstanceOf(SiteUnreachableError)
    expect(err).toMatchObject({ siteLabel: 'Box One', logicalSiteId: SITE, revoked: false })
  })

  it('a site hq has no row for is named by its id', async () => {
    request.mockReset().mockRejectedValue(new ChannelRequestFailed('not reachable', 'offline'))
    await expect(getRun('site-unknown', 'r1')).rejects.toMatchObject({ siteLabel: 'site-unknown' })
  })

  it('a version-mismatched site gets the version_mismatch reason, naming its protocol version', async () => {
    await registered('VERSION_MISMATCH', '6.3')
    request.mockRejectedValue(new ChannelRequestFailed('offline', 'offline'))

    const err = await getRun(SITE, 'r1').catch((e) => e)

    expect(err).toMatchObject({ reason: 'version_mismatch', revoked: false, protocolVersion: '6.3' })
    expect(err.message).toContain('6.3')
  })

  it('handler_failed and a non-channel error propagate unchanged, not swallowed into SiteUnreachableError', async () => {
    await registered('ONLINE')
    const handlerFailed = new ChannelRequestFailed('Session not found', 'handler_failed')
    request.mockRejectedValueOnce(handlerFailed)
    await expect(getRun(SITE, 'r1')).rejects.toBe(handlerFailed)

    const boom = new Error('boom')
    request.mockRejectedValueOnce(boom)
    await expect(listRuns(SITE, {})).rejects.toBe(boom)
  })

  // Task 2.21: an unreachable site gives the explicit error, never an empty list.
  it('listActiveRuns gives the same explicit SiteUnreachableError as every other read', async () => {
    await registered('OFFLINE')
    request.mockRejectedValue(new ChannelRequestFailed('not connected', 'offline'))
    await expect(listActiveRuns(SITE, { ownerType: 'project', ownerId: 'p1' })).rejects.toBeInstanceOf(SiteUnreachableError)
  })
})

describe('a revoked site is refused before anything is sent', () => {
  it('dispatchRun throws a revoked SiteUnreachableError without touching the channel', async () => {
    await registered('REVOKED')

    const dispatched = await dispatchRun(SITE, { context: { packages: null } } as any).catch((e) => e)

    expect(dispatched).toMatchObject({ name: 'SiteUnreachableError', revoked: true })
    expect(request).not.toHaveBeenCalled()
  })

  it('dispatches normally to a site that is not revoked', async () => {
    await registered('ONLINE')
    request.mockResolvedValue({ runId: 'run-1', sessionId: 's1' })
    await expect(dispatchRun(SITE, { context: { packages: null } } as any)).resolves.toEqual({ runId: 'run-1', sessionId: 's1' })
    expect(request).toHaveBeenCalledWith(SITE, RUNTIME_METHODS.runDispatch, expect.anything())
  })
})

const PACKAGES: RunPackages = {
  agent: { kind: 'agent', key: 'a1', digest: 'a'.repeat(64) },
  org: null,
  platform: { kind: 'platform', key: 'platform', digest: 'b'.repeat(64) },
}

/** The packages were delivered to the site, and strictly before the one channel request. */
function expectDeliveredBefore(method: string): void {
  expect(deliverPackages).toHaveBeenCalledWith(SITE, PACKAGES)
  expect(request).toHaveBeenCalledTimes(1)
  expect(request.mock.calls[0][1]).toBe(method)
  expect(deliverPackages.mock.invocationCallOrder[0]).toBeLessThan(request.mock.invocationCallOrder[0])
}

describe('a run carries its packages to the site first', () => {
  it('dispatchRun delivers payload.context.packages before dispatching', async () => {
    await registered('ONLINE')
    request.mockResolvedValue({ runId: 'run-1', sessionId: 's1' })
    await dispatchRun(SITE, { context: { packages: PACKAGES } } as any)
    expectDeliveredBefore(RUNTIME_METHODS.runDispatch)
  })

  it('a failed delivery sends no dispatch', async () => {
    await registered('ONLINE')
    deliverPackages.mockRejectedValue(new PackageDeliveryError('package_delivery_failed', 'nope'))

    await expect(dispatchRun(SITE, { context: { packages: PACKAGES } } as any)).rejects.toBeInstanceOf(PackageDeliveryError)
    expect(request).not.toHaveBeenCalled()
  })
})

describe('replacing an unanswered request', () => {
  it('asks the site to mark it replaced', async () => {
    await registered('ONLINE', '1.0')
    request.mockResolvedValue({ ok: true })
    await expect(replaceRequest(SITE, 'r1')).resolves.toBeUndefined()
    expect(request).toHaveBeenCalledWith(SITE, RUNTIME_METHODS.runReject, { runId: 'r1', replaced: true })
  })
})
