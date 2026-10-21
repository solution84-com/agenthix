import { describe, it, expect, vi, beforeEach } from 'vitest'
import { prisma } from '../../test/db'
import { createProject, createUserWithRole } from '../../test/factories'

// HQ's side of reconciling after a restore (host-management spec §12), against the real test database, with the
// site's answer to site.restoreReport stood in.

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<any>('wasp/server')
  const { prisma } = await import('../../test/db')
  return { ...actual, prisma }
})

const report = vi.hoisted(() => ({ value: null as unknown }))
vi.mock('../channel', () => ({
  siteChannelRegistry: {
    isOnline: () => true,
    request: async () => report.value,
  },
}))

import { reconcileAfterRestore, RESTORE_NOTIFICATION_TYPES as T } from '../restoreReconcile'

let seq = 0
async function makeSite() {
  seq++
  return prisma.executionSite.create({
    data: { siteId: `restored-${seq}`, label: `office-server-${seq}`, status: 'ONLINE', credentialHash: 'a'.repeat(64) } as any,
  })
}

describe('reconcileAfterRestore @SC-928', () => {
  beforeEach(async () => {
    await createUserWithRole('ADMIN')
  })

  it('tells organisation admins once what a restored site lost', async () => {
    const site = await makeSite()
    await prisma.workspacePlacement.createMany({ data: [{ workspaceId: 'w-kept', siteId: site.id }, { workspaceId: 'w-lost', siteId: site.id }] })
    report.value = { restored: { night: '2026-10-12', takenAt: '2026-10-13T02:00:00.000Z' }, workspaces: [{ id: 'w-kept', ownerType: 'project', ownerId: 'x' }] }
    await reconcileAfterRestore(site.siteId)
    await reconcileAfterRestore(site.siteId)
    const notices = await prisma.notification.findMany({ where: { type: T.restored } })
    expect(notices).toHaveLength(1)
    expect(notices[0].body).toContain('1 workspace HQ placed there is not back.')
  })

  it('after HQ was restored, takes back a workspace whose owner HQ knows on that site, and tells admins about one it does not', async () => {
    const site = await makeSite()
    const project = await createProject()
    await prisma.project.update({ where: { id: project.id }, data: { executionSiteId: site.id } })
    process.env.HQ_RESTORED_FROM = '2026-10-13T02:00:00.000Z'
    report.value = {
      restored: null,
      workspaces: [{ id: 'w-known', ownerType: 'project', ownerId: project.id }, { id: 'w-stranger', ownerType: 'project', ownerId: 'gone' }],
    }
    await reconcileAfterRestore(site.siteId)
    expect(await prisma.workspacePlacement.findUnique({ where: { workspaceId: 'w-known' } })).toMatchObject({ siteId: site.id })
    expect(await prisma.workspacePlacement.findUnique({ where: { workspaceId: 'w-stranger' } })).toBeNull()
    const [notice] = await prisma.notification.findMany({ where: { type: T.unrecognised } })
    expect(notice.title).toContain('holds 1 workspace HQ does not recognise')
    expect(notice.body).toContain('HQ took back 1 other workspace whose owner it knows.')
    delete process.env.HQ_RESTORED_FROM
  })

  it('takes nothing back when HQ was not restored, so a site cannot claim a workspace HQ never placed', async () => {
    const site = await makeSite()
    const project = await createProject()
    await prisma.project.update({ where: { id: project.id }, data: { executionSiteId: site.id } })
    report.value = { restored: null, workspaces: [{ id: 'w-claimed', ownerType: 'project', ownerId: project.id }] }
    await reconcileAfterRestore(site.siteId)
    expect(await prisma.workspacePlacement.findUnique({ where: { workspaceId: 'w-claimed' } })).toBeNull()
  })
})
