import { describe, it, expect, vi } from 'vitest'
import { prisma } from '../../test/db'
import { createUser } from '../../test/factories'

// Authenticated-shell server seams (F-017c scope), against the real test DB
// (ADR-0035):
//
//  - SC-015 — the profile's role, member-since and voice preferences.
//
vi.mock('wasp/server', async (importOriginal) => {
  const actual = await importOriginal<any>()
  return { ...actual, prisma }
})

import { getUserSettings } from '../../settings/queries'
import { updateUserSettings } from '../../settings/actions'

// Minimal Wasp query context: the authenticated user plus the entity delegates
// the query touches, backed by the real test Prisma client.
function ctx(user: { id: string } | undefined) {
  return {
    user,
    entities: {
      User: prisma.user,
      AgentSession: prisma.agentSession,
      UserSettings: prisma.userSettings,
    },
  } as any
}

const SIGNED_IN = { id: 'status-reader' }

describe('profile + voice preferences @SC-015', () => {
  it('getUserSettings exposes role and a member-since timestamp, auto-creating defaults on first access', async () => {
    const user = await createUser()

    // No UserSettings row yet — the query creates one with sensible defaults.
    expect(await prisma.userSettings.findUnique({ where: { userId: user.id } })).toBeNull()

    const settings = await getUserSettings(undefined, ctx(user))

    expect(settings.role).toBe('MEMBER')
    // member-since — the createdAt the Profile view renders.
    expect(settings.createdAt).toBeInstanceOf(Date)
    expect(settings.busyConversationMode).toBe('WAIT')

    // Row now persisted.
    expect(await prisma.userSettings.findUnique({ where: { userId: user.id } })).not.toBeNull()
  })

  it('updateUserSettings persists what a message into a running reply does', async () => {
    const user = await createUser()

    await updateUserSettings({ busyConversationMode: 'INTERRUPT' }, ctx(user))

    const saved = await getUserSettings(undefined, ctx(user))
    expect(saved.busyConversationMode).toBe('INTERRUPT')
  })

  it('getUserSettings rejects an unauthenticated caller with 401', async () => {
    await expect(getUserSettings(undefined, ctx(undefined))).rejects.toMatchObject({
      statusCode: 401,
    })
  })
})
