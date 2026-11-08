/**
 * What the Organisation page's cards read (every screen reviewed spec §3, Organisation), against the real test
 * database: everyone sees the people the organisation has, an admin also the invitations still waiting, and only an
 * admin reads the state of the organisation's settings.
 */
import { describe, it, expect, vi } from 'vitest'
import { prisma } from '../../test/db'
import { createUserWithRole } from '../../test/factories'

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<any>('wasp/server')
  const { prisma } = await import('../../test/db')
  return { ...actual, prisma }
})

import { getOrgSettingsState, getWorkplacePeople } from '../workplaceQueries'

const ctx = (user?: { id: string }) => ({ user }) as any

describe('getWorkplacePeople @SC-664', () => {
  it('counts the people who are here and gives a few faces, to anyone signed in', async () => {
    const admin = await createUserWithRole('ADMIN')
    const member = await createUserWithRole('MEMBER')
    const left = await createUserWithRole('MEMBER')
    await prisma.user.update({ where: { id: left.id }, data: { deactivatedAt: new Date() } })

    const seen = await getWorkplacePeople(undefined, ctx(member))
    expect(seen.count).toBe(2)
    expect(seen.faces.map(f => f.userId).sort()).toEqual([admin.id, member.id].sort())
    expect(seen.waitingInvitations).toBeNull()
    await expect(getWorkplacePeople(undefined, ctx())).rejects.toMatchObject({ statusCode: 401 })
  })

  it('tells an admin how many invitations are waiting, not counting used, revoked or expired ones', async () => {
    const admin = await createUserWithRole('ADMIN')
    const invite = (tokenHash: string, over: Record<string, unknown> = {}) =>
      prisma.invite.create({ data: { tokenHash, createdBy: admin.id, ...over } })
    await invite('waiting-1')
    await invite('waiting-2', { expiresAt: new Date(Date.now() + 86_400_000) })
    await invite('used', { consumedAt: new Date() })
    await invite('revoked', { revokedAt: new Date() })
    await invite('expired', { expiresAt: new Date(Date.now() - 86_400_000) })

    const seen = await getWorkplacePeople(undefined, ctx(admin))
    expect(seen.waitingInvitations?.count).toBe(2)
    expect(seen.waitingInvitations?.latestAt).toBeInstanceOf(Date)
  })
})

describe('getOrgSettingsState @SC-665', () => {
  it('is for admins', async () => {
    const member = await createUserWithRole('MEMBER')
    await expect(getOrgSettingsState(undefined, ctx(member))).rejects.toMatchObject({ statusCode: 403 })
  })

  it('reads each setting’s state: the model providers, oldest first, GitHub accounts, run limits, risk rules, automation and voice', async () => {
    const admin = await createUserWithRole('ADMIN')
    await prisma.org.create({ data: { name: 'Acme', runTimeLimitMinutes: 30, runTurnLimit: 50 } })
    await prisma.aiProvider.create({ data: { name: 'Anthropic', vendor: 'anthropic', credentialKind: 'api_key', secret: 'x' } })
    await prisma.aiProvider.create({ data: { name: 'OpenRouter', vendor: 'openrouter', credentialKind: 'api_key', secret: 'x' } })
    await prisma.aiProvider.create({ data: { name: 'AssemblyAI', vendor: 'assemblyai', credentialKind: 'api_key', secret: 'x' } })
    await prisma.gitHubInstallation.create({ data: { installationId: 1, accountLogin: 'acme', accountType: 'Organization' } })
    await prisma.siteConfig.create({ data: { riskRules: [{ pattern: 'rm -rf', riskLevel: 'HIGH' }] } })
    await prisma.provider.create({ data: { service: 'stt', name: 'assemblyai', apiKey: 'x', isEnabled: true } })

    const state = await getOrgSettingsState(undefined, ctx(admin))
    expect(state.modelProviders).toEqual(['Anthropic', 'OpenRouter'])
    expect(state.githubAccounts).toBe(1)
    expect(state.runLimits).toEqual({ timeLimitMinutes: 30, turnLimit: 50 })
    expect(state.riskRules).toBe(1)
    expect(state.voiceOn).toBe(true)
  })
})
