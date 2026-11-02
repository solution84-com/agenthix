import { describe, expect, it, vi } from 'vitest'

vi.mock('wasp/server', () => ({ prisma: {} }))

import type { SiteFacts } from '../siteFacts'
import { diskFillingNotice } from '../siteNotifications'

const GB = 1024 ** 3
const site = (status: string, disk: { freeBytes: number; totalBytes: number } | null, copies?: number) => ({
  siteId: 's1', status,
  health: { disk, ...(copies !== undefined ? { branchCopies: { usedBytes: copies } } : {}) },
}) as unknown as SiteFacts

describe('the notice that a machine\'s disk is 80% used', () => {
  it('is raised from 80% used, and names what branch copies take', () => {
    const n = diskFillingNotice(site('ONLINE', { freeBytes: 20 * GB, totalBytes: 100 * GB }, 12 * GB), 'office')
    expect(n).toMatchObject({ type: 'site_disk_filling', subjectKey: 's1', title: "office's disk is 80% used" })
    expect(n?.body).toContain('Branch copies take 12 GB')
  })

  it('stays open until the disk is below 75% used, so it does not flap', () => {
    const at77 = site('ONLINE', { freeBytes: 23 * GB, totalBytes: 100 * GB })
    expect(diskFillingNotice(at77, 'office')).toBeNull()
    expect(diskFillingNotice(at77, 'office', true)).not.toBeNull()
    expect(diskFillingNotice(site('ONLINE', { freeBytes: 26 * GB, totalBytes: 100 * GB }), 'office', true)).toBeNull()
  })

  it('is not raised below 80%, for a site that is away, or with no disk figure', () => {
    expect(diskFillingNotice(site('ONLINE', { freeBytes: 30 * GB, totalBytes: 100 * GB }), 'office')).toBeNull()
    expect(diskFillingNotice(site('OFFLINE', { freeBytes: 5 * GB, totalBytes: 100 * GB }), 'office')).toBeNull()
    expect(diskFillingNotice(site('ONLINE', null), 'office')).toBeNull()
  })
})
