/**
 * Organisation › People and a person's name, picture and profile card (every
 * screen reviewed spec §3, People), against the real test DB. Admins list
 * everyone — here, left, erased — with the invitations; one person shows the
 * projects they are in, a private one the admin is not in counted but never
 * named. A person sets their own name and picture, and an admin anyone's.
 */
import { describe, it, expect, vi } from 'vitest'
import { prisma } from '../../test/db'
import { createUser, createUserWithRole, createProject, createTestTask } from '../../test/factories'

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<any>('wasp/server')
  const { prisma } = await import('../../test/db')
  return { ...actual, prisma }
})

import { getOrgPeople, getOrgPerson } from '../orgPeopleQueries'
import { getPersonCard } from '../personCard'
import { setPersonName, removePersonPicture } from '../personProfileActions'

const as = (user: { id: string }) => ({ user }) as any

describe('getOrgPeople @SC-602', () => {
  it('lists everyone with their state, those here first, and the invitations waiting and earlier', async () => {
    const admin = await createUserWithRole('ADMIN', { displayName: 'Ada' })
    const left = await createUserWithRole('MEMBER', { displayName: 'Lee', deactivatedAt: new Date() })
    const erased = await createUser({ deactivatedAt: new Date(), erasedAt: new Date() })
    await prisma.invite.create({ data: { tokenHash: 'w'.repeat(64), note: 'Sam, design', createdBy: admin.id, expiresAt: new Date(Date.now() + 60_000) } })
    await prisma.invite.create({ data: { tokenHash: 'x'.repeat(64), note: 'Old', createdBy: admin.id, expiresAt: new Date(Date.now() - 60_000) } })

    const view = await getOrgPeople(undefined, as(admin))

    expect(view.people.map(p => [p.person.userId, p.person.state])).toEqual([
      [admin.id, 'active'], [left.id, 'left'], [erased.id, 'erased'],
    ])
    expect(view.people[0].isMe).toBe(true)
    expect(view.invitations.waiting.map(i => [i.forWhom, i.state, i.invitedBy?.name])).toEqual([['Sam, design', 'waiting', 'Ada']])
    expect(view.invitations.earlier.map(i => [i.forWhom, i.state])).toEqual([['Old', 'expired']])
  })

  it('is for organisation admins', async () => {
    await expect(getOrgPeople(undefined, as(await createUserWithRole('MEMBER')))).rejects.toMatchObject({ statusCode: 403 })
  })
})

describe('getOrgPerson @SC-602', () => {
  it('names the projects the admin can see, with role and open tasks, and counts a private one they are not in', async () => {
    const admin = await createUserWithRole('ADMIN')
    const dana = await createUserWithRole('MEMBER')
    const open = await createProject({ accessLevel: 'OPEN', name: 'Website' })
    const hidden = await createProject({ accessLevel: 'PRIVATE', name: 'Secret' })
    await prisma.projectMember.createMany({ data: [
      { projectId: open.id, userId: dana.id, role: 'ADMIN' },
      { projectId: hidden.id, userId: dana.id, role: 'MEMBER' },
    ] })
    await createTestTask({ data: { title: 'T', projectId: open.id, number: 1, onBehalfOfUserId: dana.id } })

    const view = await getOrgPerson({ userId: dana.id }, as(admin))

    expect(view.projects).toEqual([{ id: open.id, key: open.key, name: 'Website', accessLevel: 'OPEN', role: 'ADMIN', openTaskCount: 1 }])
    expect(view.privateProjectCount).toBe(1)
    expect(JSON.stringify(view)).not.toContain('Secret')
  })
})

describe('who invited a person @SC-602', () => {
  it('names who created the invitation they accepted, and no one for a person who came in without one', async () => {
    const admin = await createUserWithRole('ADMIN', { displayName: 'Ada' })
    const dana = await createUserWithRole('MEMBER', { displayName: 'Dana' })
    await prisma.invite.create({ data: { tokenHash: 'y'.repeat(64), createdBy: admin.id, consumedAt: new Date(), consumedBy: dana.id } })

    expect((await getOrgPerson({ userId: dana.id }, as(admin))).invitedBy?.name).toBe('Ada')
    expect((await getOrgPerson({ userId: admin.id }, as(admin))).invitedBy).toBeNull()
  })
})

describe('getPersonCard @SC-600', () => {
  it('shows the projects the viewer shares with them, and their role here, to anyone in the organisation', async () => {
    const me = await createUserWithRole('MEMBER')
    const dana = await createUserWithRole('MEMBER', { displayName: 'Dana' })
    const shared = await createProject({ name: 'Shared' })
    const theirsOnly = await createProject({ accessLevel: 'PRIVATE', name: 'Theirs' })
    await prisma.projectMember.createMany({ data: [
      { projectId: shared.id, userId: me.id }, { projectId: shared.id, userId: dana.id, role: 'ADMIN' },
      { projectId: theirsOnly.id, userId: dana.id },
    ] })

    const card = await getPersonCard({ userId: dana.id, projectId: shared.id }, as(me))

    expect(card.person.name).toBe('Dana')
    expect(card.sharedProjects.map(p => p.name)).toEqual(['Shared'])
    expect(card.here).toMatchObject({ projectId: shared.id, role: 'ADMIN' })
    expect(card.viewerIsOrgAdmin).toBe(false)
  })

  it('says nothing about a project the viewer is not in', async () => {
    const me = await createUserWithRole('MEMBER')
    const dana = await createUserWithRole('MEMBER')
    const theirs = await createProject()
    await prisma.projectMember.create({ data: { projectId: theirs.id, userId: dana.id } })
    expect((await getPersonCard({ userId: dana.id, projectId: theirs.id }, as(me))).here).toBeNull()
  })
})

describe('a person\'s name and picture @SC-601', () => {
  it('is set by the person, and by an organisation admin, and by nobody else', async () => {
    const dana = await createUserWithRole('MEMBER')
    const admin = await createUserWithRole('ADMIN')
    const other = await createUserWithRole('MEMBER')

    await setPersonName({ userId: dana.id, displayName: '  Dana   Reyes ' }, as(dana))
    expect((await prisma.user.findUniqueOrThrow({ where: { id: dana.id } })).displayName).toBe('Dana Reyes')
    await setPersonName({ userId: dana.id, displayName: 'D. Reyes' }, as(admin))
    expect((await prisma.user.findUniqueOrThrow({ where: { id: dana.id } })).displayName).toBe('D. Reyes')
    await expect(setPersonName({ userId: dana.id, displayName: 'X' }, as(other))).rejects.toMatchObject({ statusCode: 403 })
  })

  it('goes back to the initial when the picture is removed, and refuses an erased person', async () => {
    const dana = await createUserWithRole('MEMBER', { avatarUrl: '/people/d/images/a.png' })
    await removePersonPicture({ userId: dana.id }, as(dana))
    expect((await prisma.user.findUniqueOrThrow({ where: { id: dana.id } })).avatarUrl).toBeNull()

    const admin = await createUserWithRole('ADMIN')
    const erased = await createUser({ deactivatedAt: new Date(), erasedAt: new Date() })
    await expect(setPersonName({ userId: erased.id, displayName: 'Back' }, as(admin))).rejects.toMatchObject({ statusCode: 400 })
  })
})
