import { describe, it, expect, vi } from 'vitest'
import { prisma } from '../../test/db'
import { createProject, createUserWithRole, joinProjectAs } from '../../test/factories'

// What onboarding reads for an invited person (getting-in spec, Onboarding):
// the organisation, themselves and what their invitation made them part of,
// against the real test database.

vi.mock('wasp/server', async () => {
  const { prisma } = await import('../../test/db')
  const { HttpError } = await vi.importActual<any>('wasp/server')
  return { prisma, HttpError }
})

import { getOnboardingData } from '../queries'

const ctx = (user?: { id: string }) => ({ user }) as any

async function invitedPerson(opts: { role?: 'ADMIN' | 'MEMBER'; projectIds?: string[]; inviterName?: string | null } = {}) {
  const inviter = await createUserWithRole('ADMIN', { displayName: opts.inviterName ?? 'Avery Chen' })
  const person = await createUserWithRole(opts.role ?? 'MEMBER', {
    displayName: 'Dana Ruiz',
    auth: { create: { identities: { create: { providerName: 'username', providerUserId: 'dana', providerData: '{}' } } } },
  })
  await prisma.invite.create({
    data: { tokenHash: `h-${person.id}`, role: opts.role ?? 'MEMBER', createdBy: inviter.id, projectIds: opts.projectIds ?? [], consumedAt: new Date(), consumedBy: person.id },
  })
  return person
}

describe('getOnboardingData @SC-720', () => {
  it('names the organisation, the person, who invited them and the projects named, the first being where they land', async () => {
    await prisma.org.create({ data: { name: 'Acme Corp', handle: 'acmecorp' } })
    const web = await createProject({ name: 'Website Redesign', key: 'WEB' })
    const app = await createProject({ name: 'Merchant app', key: 'APP' })
    const dana = await invitedPerson({ projectIds: [web.id, app.id] })
    await joinProjectAs(web.id, dana.id)

    const data = await getOnboardingData(undefined as any, ctx(dana))

    expect(data).toMatchObject({
      orgName: 'Acme Corp',
      identity: { shows: 'cover', name: 'Acme Corp' },
      me: { id: dana.id, displayName: 'Dana Ruiz', username: 'dana', avatarUrl: null },
      role: 'MEMBER',
      invitedBy: 'Avery Chen',
      projects: [{ key: 'WEB', name: 'Website Redesign' }, { key: 'APP', name: 'Merchant app' }],
      needsSetup: false,
      landAt: '/projects/WEB',
    })
  })

  it('lands on Home when the invitation named no project', async () => {
    await prisma.org.create({ data: { name: 'Acme Corp' } })
    const dana = await invitedPerson()
    expect(await getOnboardingData(undefined as any, ctx(dana))).toMatchObject({ projects: [], landAt: '/' })
  })

  it('asks for the model step only while the organisation provides no model access', async () => {
    await prisma.org.create({ data: { name: 'Acme Corp' } })
    const dana = await invitedPerson()
    expect((await getOnboardingData(undefined as any, ctx(dana))).needsModel).toBe(true)

    await prisma.provider.create({ data: { service: 'llm', name: 'anthropic', apiKey: 'x' } })
    expect((await getOnboardingData(undefined as any, ctx(dana))).needsModel).toBe(false)
  })

  it('treats an invited admin as onboarding\'s, never setup\'s', async () => {
    await prisma.org.create({ data: { name: 'Acme Corp' } })
    const admin = await invitedPerson({ role: 'ADMIN' })
    expect(await getOnboardingData(undefined as any, ctx(admin))).toMatchObject({ role: 'ADMIN', needsSetup: false })
  })

  it('marks the first admin\'s account as setup\'s so the page sends them there', async () => {
    await prisma.org.create({ data: { name: 'My Organisation' } })
    const admin = await createUserWithRole('ADMIN')
    await prisma.invite.create({ data: { kind: 'FIRST_ADMIN', tokenHash: `h-${admin.id}`, role: 'ADMIN', createdBy: null, consumedAt: new Date(), consumedBy: admin.id } })
    expect(await getOnboardingData(undefined as any, ctx(admin))).toMatchObject({ needsSetup: true, invitedBy: null, projects: [] })
  })

  it('refuses someone not signed in', async () => {
    await expect(getOnboardingData(undefined as any, ctx())).rejects.toMatchObject({ statusCode: 401 })
  })
})
