/** `site.loads` (consoleFacts.ts): only a site connected now, with a health report in its shape, gives its runs. */
import { describe, expect, it, vi } from 'vitest'

vi.mock('wasp/server', () => ({ prisma: {} }))
vi.mock('../../org/publicIdentity', () => ({ readOrgCard: async () => ({ name: 'Acme Robotics' }) }))
vi.mock('../../auth/hqLinks', () => ({ hqAddress: () => 'https://hq.acme.example' }))

import { hqAbout, siteLoadsOf } from '../consoleFacts'

const health = (running: number, maxAtOnce: number) => ({
  takenAt: '2026-10-15T08:00:00.000Z',
  runs: { running, maxAtOnce },
  disk: null,
  docker: { running: true, version: '27.0' },
  agentImage: { name: 'agent', present: true, version: null },
  ceilings: null,
  memoryNearlyFull: false,
})
const at = new Date('2026-10-15T08:00:05.000Z')

describe('what hq tells the Fleet Console’s screens @SC-938', () => {
  it('names the organisation and the address people open HQ at', async () => {
    expect(await hqAbout()).toEqual({ organisationName: 'Acme Robotics', address: 'https://hq.acme.example' })
  })

  it('gives each connected site’s runs from its last health report', () => {
    expect(siteLoadsOf([
      { id: 's-hq', isDefault: true, status: 'ONLINE', health: health(2, 4), healthReportedAt: at },
      { id: 's-office', isDefault: false, status: 'ONLINE', health: health(1, 6), healthReportedAt: at },
    ])).toEqual([
      { executionSiteId: 's-hq', isDefault: true, running: 2, maxAtOnce: 4, reportedAt: at.toISOString(), copiesBytes: null },
      { executionSiteId: 's-office', isDefault: false, running: 1, maxAtOnce: 6, reportedAt: at.toISOString(), copiesBytes: null },
    ])
  })

  it('passes on the disk a site\'s branch copies use', () => {
    const [load] = siteLoadsOf([
      { id: 's', isDefault: false, status: 'ONLINE', health: { ...health(0, 4), branchCopies: { usedBytes: 5000 } }, healthReportedAt: at },
    ])
    expect(load.copiesBytes).toBe(5000)
  })

  it('leaves out a site that is away, has not reported, or reported something else', () => {
    expect(siteLoadsOf([
      { id: 's-away', isDefault: false, status: 'OFFLINE', health: health(1, 6), healthReportedAt: at },
      { id: 's-new', isDefault: false, status: 'ONLINE', health: null, healthReportedAt: null },
      { id: 's-odd', isDefault: false, status: 'ONLINE', health: { runs: 'many' }, healthReportedAt: at },
    ])).toEqual([])
  })
})
