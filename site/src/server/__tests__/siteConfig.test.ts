import { afterEach, describe, it, expect, vi, beforeEach } from 'vitest'

const findFirst = vi.hoisted(() => vi.fn())
const create = vi.hoisted(() => vi.fn())
vi.mock('#db', () => ({ prisma: { siteConfig: { findFirst, create } } }))

import { ensureSiteConfig, getAgentFacingSiteUrl } from '../siteConfig'

beforeEach(() => vi.clearAllMocks())

describe("this installation's identity @SC-290", () => {
  it('creates the row on first boot, so a fresh site can register at all', async () => {
    // Without this, registering threw "SiteConfig is missing" and there was
    // no path that ever created one.
    findFirst.mockResolvedValue(null)
    create.mockResolvedValue({ id: 'singleton', siteId: 'generated-uuid' })

    await expect(ensureSiteConfig()).resolves.toEqual({ siteId: 'generated-uuid' })
    expect(create).toHaveBeenCalledWith({ data: { id: 'singleton' } })
  })

  it('never regenerates it — rotating would orphan every project hq placed here', async () => {
    findFirst.mockResolvedValue({ id: 'singleton', siteId: 'existing-uuid' })
    await expect(ensureSiteConfig()).resolves.toEqual({ siteId: 'existing-uuid' })
    expect(create).not.toHaveBeenCalled()
  })
})

const KEYS = ['SITE_AGENT_URL', 'SITE_CONTAINER_NAME', 'AGENT_CONTAINER_ISOLATION', 'PORT'] as const
afterEach(() => { for (const k of KEYS) delete process.env[k] })

describe('getAgentFacingSiteUrl', () => {
  it('uses SITE_AGENT_URL when set, without a trailing slash', () => {
    process.env.SITE_AGENT_URL = 'http://site.internal:9000/'
    expect(getAgentFacingSiteUrl()).toBe('http://site.internal:9000')
  })
  it('addresses the site container by name when the site runs in one', () => {
    process.env.SITE_CONTAINER_NAME = 'agenthix-site'
    process.env.PORT = '4201'
    expect(getAgentFacingSiteUrl()).toBe('http://agenthix-site:4201')
  })
  it('goes through the machine when agents are containers and the site is not', () => {
    process.env.AGENT_CONTAINER_ISOLATION = 'true'
    expect(getAgentFacingSiteUrl()).toBe('http://host.docker.internal:4201')
  })
  it('is localhost when agents run as local processes', () => {
    expect(getAgentFacingSiteUrl()).toBe('http://localhost:4201')
  })
})
