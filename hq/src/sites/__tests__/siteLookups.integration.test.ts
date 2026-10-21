import { describe, it, expect, vi } from 'vitest'
import { SITE_PROTOCOL_VERSION } from '@agenthix/core'
import { prisma } from '../../test/db'

// The two ways hq picks sites without a storage owner to place by, against the
// real test database: the default site (localSite.ts) and the sites a combined
// read asks (eligibleSites.ts).

vi.mock('wasp/server', async () => {
  const { prisma } = await import('../../test/db')
  const { HttpError } = await vi.importActual<typeof import('wasp/server')>('wasp/server')
  return { prisma, HttpError }
})

import { resolveDefaultSiteRef, requireDefaultSiteRef, requireDefaultSiteId, requireDefaultExecutionSiteId } from '../localSite'
import { eligibleSites } from '../eligibleSites'
import { NO_EXECUTION_SITE_MESSAGE } from '../../shared/noExecutionSite'

let seq = 0
function makeSite(data: Record<string, unknown> = {}) {
  seq++
  return prisma.executionSite.create({
    data: { siteId: `site-${seq}`, label: `Site ${seq}`, status: 'ONLINE', credentialHash: 'h'.repeat(64), ...data },
  })
}

describe('the default Execution Site is the one hq was paired with', () => {
  it('returns the default site and names both of its ids', async () => {
    const site = await makeSite({ isDefault: true })
    await expect(resolveDefaultSiteRef()).resolves.toEqual({ id: site.id, siteId: site.siteId })
    await expect(requireDefaultSiteId()).resolves.toBe(site.siteId)
    await expect(requireDefaultExecutionSiteId()).resolves.toBe(site.id)
  })

  it('with two sites registered, work with no storage goes to the default one even when the other registered first', async () => {
    await makeSite({ registeredAt: new Date('2026-01-01') })
    const theDefault = await makeSite({ isDefault: true, registeredAt: new Date('2026-06-01') })
    await expect(requireDefaultSiteRef()).resolves.toEqual({ id: theDefault.id, siteId: theDefault.siteId })
  })

  it.each([
    ['revoked', { status: 'REVOKED' }],
    ['without a credential', { credentialHash: null }],
  ])('a default row that is %s is not the default site', async (_name, data) => {
    await makeSite({ isDefault: true, ...data })
    await expect(resolveDefaultSiteRef()).resolves.toBeNull()
  })
})

describe('with no default Execution Site', () => {
  it('resolves to null, and does not fall back to another registered site', async () => {
    await makeSite()
    await expect(resolveDefaultSiteRef()).resolves.toBeNull()
  })

  it('never creates a site of its own, however SiteConfig looks', async () => {
    await prisma.siteConfig.create({ data: { siteId: 'local-site-uuid', name: 'Agenthix Site' } })
    await resolveDefaultSiteRef()
    await requireDefaultSiteRef().catch(() => {})
    expect(await prisma.executionSite.count()).toBe(0)
  })

  it.each([
    ['requireDefaultSiteRef', requireDefaultSiteRef],
    ['requireDefaultSiteId', requireDefaultSiteId],
    ['requireDefaultExecutionSiteId', requireDefaultExecutionSiteId],
  ])('%s throws the shared error, 503, with the exact message', async (_name, fn) => {
    const err = await fn().catch((e: unknown) => e)
    expect(err).toMatchObject({ statusCode: 503, message: NO_EXECUTION_SITE_MESSAGE })
  })
})

describe('which sites a combined read considers', () => {
  it('every unrevoked site, online or not, version-suspended included, never a revoked one', async () => {
    await makeSite({ siteId: 'site-a', registeredAt: new Date('2026-01-01') })
    await makeSite({ siteId: 'site-gone', status: 'REVOKED', registeredAt: new Date('2026-01-02') })
    await makeSite({ siteId: 'site-c', status: 'OFFLINE', registeredAt: new Date('2026-01-03') })
    await makeSite({ siteId: 'site-old', status: 'VERSION_MISMATCH', protocolVersion: '9.4', registeredAt: new Date('2026-01-04') })

    const sites = await eligibleSites()

    expect(sites.map((s) => s.siteId)).toEqual(['site-a', 'site-c', 'site-old'])
    expect(sites[2]).toMatchObject({ status: 'VERSION_MISMATCH', protocolVersion: '9.4' })
  })

  it('carries both id spaces and the label, and nothing else', async () => {
    const site = await makeSite({ siteId: 'site-a', label: 'Site A', protocolVersion: SITE_PROTOCOL_VERSION })
    expect(await eligibleSites()).toEqual([
      { id: site.id, siteId: 'site-a', label: 'Site A', status: 'ONLINE', protocolVersion: SITE_PROTOCOL_VERSION },
    ])
  })

  it('returns the sites in a stable order, ties on registration broken by id', async () => {
    const at = new Date('2026-03-01')
    const made = await Promise.all([makeSite({ registeredAt: at }), makeSite({ registeredAt: at }), makeSite({ registeredAt: at })])
    const expected = made.map((s) => s.id).sort()
    expect((await eligibleSites()).map((s) => s.id)).toEqual(expected)
    expect((await eligibleSites()).map((s) => s.id)).toEqual(expected)
  })

  it('with no site registered, has no site to ask and invents none', async () => {
    await expect(eligibleSites()).resolves.toEqual([])
  })
})
