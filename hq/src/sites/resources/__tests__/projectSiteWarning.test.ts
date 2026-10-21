/** The warning on a project whose site's machine is nearly out of disk or memory: a sentence, never a figure. */
import { describe, it, expect } from 'vitest'
import type { SiteHealth } from '@agenthix/core'
import { projectSiteAsShown } from '../projectSiteWarning'

const GIB = 1024 ** 3
const health = (over: Partial<SiteHealth> = {}): SiteHealth => ({
  takenAt: new Date(0).toISOString(),
  runs: { running: 0, maxAtOnce: 4 },
  disk: { freeBytes: 200 * GIB, totalBytes: 500 * GIB },
  docker: { running: true, version: '27' },
  agentImage: { name: 'agent', present: true, version: null },
  ceilings: null,
  memoryNearlyFull: false,
  ...over,
})
const site = (h: SiteHealth, status = 'ONLINE') => ({ id: 'x', label: 'office-server', isDefault: false, status, health: h })

describe("a project's site as a member is given it", () => {
  it('warns when its machine is nearly out of disk, in a sentence with no figure', () => {
    const shown = projectSiteAsShown(site(health({ disk: { freeBytes: 2 * GIB, totalBytes: 500 * GIB } })))
    expect(shown).toEqual({ id: 'x', label: 'office-server', warning: 'office-server is nearly out of disk; runs may fail. Your fleet admins have been told.' })
    expect(JSON.stringify(shown)).not.toMatch(/\d/)
  })

  it('warns when it is nearly out of memory, and of both together', () => {
    expect(projectSiteAsShown(site(health({ memoryNearlyFull: true })))?.warning).toBe(
      'office-server is nearly out of memory; runs may fail. Your fleet admins have been told.')
    expect(projectSiteAsShown(site(health({ memoryNearlyFull: true, disk: { freeBytes: 1 * GIB, totalBytes: 50 * GIB } })))?.warning).toBe(
      'office-server is nearly out of disk and memory; runs may fail. Your fleet admins have been told.')
  })

  it('says nothing when all is well, or of a site that is away, and never passes on its health', () => {
    const fine = projectSiteAsShown(site(health()))
    expect(fine).toEqual({ id: 'x', label: 'office-server', warning: null })
    expect(fine).not.toHaveProperty('health')
    expect(projectSiteAsShown(site(health({ memoryNearlyFull: true }), 'OFFLINE'))?.warning).toBeNull()
    expect(projectSiteAsShown(null)).toBeNull()
  })
})
