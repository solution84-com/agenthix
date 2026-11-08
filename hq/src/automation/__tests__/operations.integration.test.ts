/**
 * The org's and a project's automation operations against Postgres (adr-0175): the org's limits are its admins', a
 * project's choice whether its agents may set start times is its project admins'. Nothing here starts work.
 */
import { describe, it, expect, vi } from 'vitest'
import { prisma } from '../../test/db'
import { createProject, createUser, createUserWithRole } from '../../test/factories'

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<any>('wasp/server')
  const { prisma } = await import('../../test/db')
  return { ...actual, prisma }
})

import { getOrgAutomation, updateOrgAutomation, getProjectAutomation, updateProjectAutomation } from '../operations'
import { ORG_AUTOMATION_DEFAULTS, type OrgAutomation } from '../automationSettings'
import { projectAgentsMaySchedule } from '../automationStore'
import { addMember, ctx, privateProject, refusedWith } from './automationWorld'

const ORG_VALUES: OrgAutomation = { agentSchedules: true, maxDepth: 2 }

describe('getOrgAutomation', () => {
  it('refuses nobody signed in', async () => {
    await refusedWith(getOrgAutomation(undefined, ctx()), 401)
  })

  it('answers the defaults before the org has any stored, and the stored values after', async () => {
    const viewer = await createUserWithRole('MEMBER')
    expect(await getOrgAutomation(undefined, ctx(viewer))).toEqual(ORG_AUTOMATION_DEFAULTS)
    await prisma.org.create({ data: { name: 'Org', automationAgentSchedules: true, automationMaxDepth: 5 } })
    expect(await getOrgAutomation(undefined, ctx(viewer))).toEqual({ agentSchedules: true, maxDepth: 5 })
  })
})

describe('updateOrgAutomation', () => {
  it('refuses nobody signed in, a member, and a person with no role: it is the admins\' to change', async () => {
    await prisma.org.create({ data: { name: 'Org' } })
    await refusedWith(updateOrgAutomation(ORG_VALUES, ctx()), 401)
    await refusedWith(updateOrgAutomation(ORG_VALUES, ctx(await createUserWithRole('MEMBER'))), 403)
    await refusedWith(updateOrgAutomation(ORG_VALUES, ctx(await createUser())), 403)
    expect((await prisma.org.findFirst())!.automationMaxDepth).toBe(3)
  })

  it.each([
    ['a depth past the ceiling', { maxDepth: 21 }],
    ['a switch that is not on or off', { agentSchedules: 'yes' as unknown as boolean }],
  ])('refuses %s, changing nothing', async (_what, patch) => {
    const admin = await createUserWithRole('ADMIN')
    await prisma.org.create({ data: { name: 'Org' } })
    await refusedWith(updateOrgAutomation({ ...ORG_VALUES, ...patch }, ctx(admin)), 400)
    expect((await prisma.org.findFirst())!.automationMaxDepth).toBe(3)
  })

  it('is refused with a conflict until the organisation is set up', async () => {
    const admin = await createUserWithRole('ADMIN')
    await refusedWith(updateOrgAutomation(ORG_VALUES, ctx(admin)), 409)
  })

  it('stores the values and answers them, ignoring anything else given', async () => {
    const admin = await createUserWithRole('ADMIN')
    await prisma.org.create({ data: { name: 'Org' } })
    expect(await updateOrgAutomation({ ...ORG_VALUES, throttle: true } as OrgAutomation, ctx(admin))).toEqual(ORG_VALUES)
    expect(await getOrgAutomation(undefined, ctx(admin))).toEqual(ORG_VALUES)
  })
})

describe('getProjectAutomation', () => {
  it('refuses nobody signed in, and someone outside a private project', async () => {
    const project = await privateProject()
    await refusedWith(getProjectAutomation({ projectId: project.id }, ctx()), 401)
    await refusedWith(getProjectAutomation({ projectId: project.id }, ctx(await createUser())), 403)
  })

  it("answers the org's limits and the project's own choice, for any member", async () => {
    const project = await privateProject()
    const member = await createUser()
    await addMember(project.id, member.id)
    expect(await getProjectAutomation({ projectId: project.id }, ctx(member))).toEqual({
      org: ORG_AUTOMATION_DEFAULTS, agentSchedules: false, agentsMaySchedule: false,
    })
  })
})

describe('updateProjectAutomation', () => {
  it("refuses a plain member, and an org admin who is not on the project: it is the project admins' to change", async () => {
    await prisma.org.create({ data: { name: 'Org', automationAgentSchedules: true } })
    const project = await createProject()
    const member = await createUser()
    await addMember(project.id, member.id)
    await refusedWith(updateProjectAutomation({ projectId: project.id, agentSchedules: true }, ctx(member)), 403)
    await refusedWith(updateProjectAutomation({ projectId: project.id, agentSchedules: true }, ctx(await createUserWithRole('ADMIN'))), 403)
    expect(await projectAgentsMaySchedule(project.id)).toBe(false)
  })

  it('refuses letting agents set start times where the organisation does not allow it', async () => {
    await prisma.org.create({ data: { name: 'Org' } })
    const project = await createProject()
    const admin = await createUser()
    await addMember(project.id, admin.id, 'ADMIN')
    await refusedWith(updateProjectAutomation({ projectId: project.id, agentSchedules: true }, ctx(admin)), 400)
    await refusedWith(updateProjectAutomation({ projectId: project.id, agentSchedules: 'yes' as never }, ctx(admin)), 400)
  })

  it('stores the choice and answers the status; it applies only while the organisation allows it too', async () => {
    await prisma.org.create({ data: { name: 'Org', automationAgentSchedules: true } })
    const project = await createProject()
    const admin = await createUser()
    await addMember(project.id, admin.id, 'ADMIN')
    expect(await updateProjectAutomation({ projectId: project.id, agentSchedules: true }, ctx(admin))).toMatchObject({ agentSchedules: true, agentsMaySchedule: true })
    expect(await projectAgentsMaySchedule(project.id)).toBe(true)
    await prisma.org.updateMany({ data: { automationAgentSchedules: false } })
    expect(await projectAgentsMaySchedule(project.id)).toBe(false)
  })
})
