import { describe, it, expect, vi } from 'vitest'
import { prisma } from '../../test/db'
import { createUser } from '../../test/factories'

// A person's own settings — the row created on first read, the busy-conversation
// mode (person-scoped execution spec §2) and voice preferences, and the timezone
// filled in from the browser until the person chooses one. Against the real test database.

vi.mock('wasp/server', async () => {
  const { prisma } = await import('../../test/db')
  const { HttpError } = await vi.importActual<any>('wasp/server')
  return { prisma, HttpError }
})
vi.mock('wasp/auth/password', () => ({ hashPassword: async (p: string) => `hashed:${p}` }))

import { getUserSettings } from '../queries'
import { updateUserSettings } from '../actions'
import { syncBrowserTimezone, setMyTimezone } from '../timezoneActions'

const ctx = (user?: { id: string }) => ({ user, entities: { UserSettings: prisma.userSettings } }) as any
const settingsOf = (userId: string) => prisma.userSettings.findUnique({ where: { userId } })

describe('getUserSettings @SC-1834', () => {
  it("creates the caller's settings on first read, as a Member waiting behind a busy turn", async () => {
    const user = await createUser()

    const settings = await getUserSettings(undefined, ctx(user))

    expect(settings).toMatchObject({ userId: user.id, role: 'MEMBER', busyConversationMode: 'WAIT', adaptiveVoice: true })
    expect(await prisma.userSettings.count({ where: { userId: user.id } })).toBe(1)
    expect((await settingsOf(user.id))?.config).toEqual({})
  })

  it('returns the existing row unchanged', async () => {
    const user = await createUser()
    await prisma.userSettings.create({ data: { userId: user.id, role: 'ADMIN', busyConversationMode: 'INTERRUPT' } })
    expect(await getUserSettings(undefined, ctx(user))).toMatchObject({ role: 'ADMIN', busyConversationMode: 'INTERRUPT' })
  })

  it('refuses a caller who is not signed in (401)', async () => {
    await expect(getUserSettings(undefined, ctx())).rejects.toMatchObject({ statusCode: 401 })
  })
})

describe('updateUserSettings @SC-1834', () => {
  it('persists INTERRUPT, creating the row when there is none', async () => {
    const user = await createUser()
    await updateUserSettings({ busyConversationMode: 'INTERRUPT' }, ctx(user))
    expect(await settingsOf(user.id)).toMatchObject({ role: 'MEMBER', busyConversationMode: 'INTERRUPT' })
  })

  it('changes only the fields passed: the config leaves the busy mode and role alone', async () => {
    const user = await createUser()
    await prisma.userSettings.create({
      data: { userId: user.id, role: 'ADMIN', busyConversationMode: 'INTERRUPT', config: { theme: 'dark' } },
    })

    await updateUserSettings({ config: { theme: 'light' } }, ctx(user))

    expect(await settingsOf(user.id)).toMatchObject({
      role: 'ADMIN',
      busyConversationMode: 'INTERRUPT',
      config: { theme: 'light' },
    })
  })

  it('turns the caller\'s own Adaptive voice off and on, and nobody else\'s', async () => {
    const user = await createUser()
    const other = await createUser()
    await getUserSettings(undefined, ctx(other))

    await updateUserSettings({ adaptiveVoice: false }, ctx(user))
    expect(await settingsOf(user.id)).toMatchObject({ adaptiveVoice: false, busyConversationMode: 'WAIT' })
    expect(await getUserSettings(undefined, ctx(user))).toMatchObject({ adaptiveVoice: false })
    expect(await settingsOf(other.id)).toMatchObject({ adaptiveVoice: true })

    await updateUserSettings({ adaptiveVoice: true }, ctx(user))
    expect(await settingsOf(user.id)).toMatchObject({ adaptiveVoice: true })
  })

  it('leaves Adaptive voice alone when another field changes', async () => {
    const user = await createUser()
    await prisma.userSettings.create({ data: { userId: user.id, adaptiveVoice: false } })
    await updateUserSettings({ busyConversationMode: 'INTERRUPT' }, ctx(user))
    expect(await settingsOf(user.id)).toMatchObject({ adaptiveVoice: false, busyConversationMode: 'INTERRUPT' })
  })

  it('refuses an Adaptive voice that is not true or false (400), changing nothing', async () => {
    const user = await createUser()
    await expect(updateUserSettings({ adaptiveVoice: 'no' as never }, ctx(user))).rejects.toMatchObject({ statusCode: 400 })
    expect(await settingsOf(user.id)).toBeNull()
  })

  it('refuses a caller who is not signed in (401)', async () => {
    await expect(updateUserSettings({ busyConversationMode: 'INTERRUPT' }, ctx())).rejects.toMatchObject({ statusCode: 401 })
  })
})

describe('syncBrowserTimezone', () => {
  it('fills the timezone in when the person has none, leaving it as not chosen', async () => {
    const user = await createUser()
    await syncBrowserTimezone({ timezone: 'Australia/Sydney' }, ctx(user))
    expect(await settingsOf(user.id)).toMatchObject({ role: 'MEMBER', timezone: 'Australia/Sydney', timezoneChosen: false })
  })

  it('follows the browser when the stored one was itself taken from a browser (the person moved)', async () => {
    const user = await createUser()
    await prisma.userSettings.create({ data: { userId: user.id, timezone: 'Europe/London', timezoneChosen: false } })
    await syncBrowserTimezone({ timezone: 'Australia/Sydney' }, ctx(user))
    expect((await settingsOf(user.id))?.timezone).toBe('Australia/Sydney')
  })

  it('never overwrites a timezone the person chose', async () => {
    const user = await createUser()
    await prisma.userSettings.create({ data: { userId: user.id, timezone: 'Europe/London', timezoneChosen: true } })
    await syncBrowserTimezone({ timezone: 'Australia/Sydney' }, ctx(user))
    expect(await settingsOf(user.id)).toMatchObject({ timezone: 'Europe/London', timezoneChosen: true })
  })

  it('refuses a browser value that is not an IANA zone (400) and writes nothing', async () => {
    const user = await createUser()
    await expect(syncBrowserTimezone({ timezone: 'Mars/Olympus' }, ctx(user))).rejects.toMatchObject({ statusCode: 400 })
    expect(await settingsOf(user.id)).toBeNull()
  })

  it('refuses a caller who is not signed in (401)', async () => {
    await expect(syncBrowserTimezone({ timezone: 'Australia/Sydney' }, ctx())).rejects.toMatchObject({ statusCode: 401 })
  })
})

describe('setMyTimezone', () => {
  it("stores the zone as the person's own choice", async () => {
    const user = await createUser()
    await setMyTimezone({ timezone: 'Europe/London' }, ctx(user))
    expect(await settingsOf(user.id)).toMatchObject({ timezone: 'Europe/London', timezoneChosen: true })
  })

  it('clearing it hands the timezone back to the browser', async () => {
    const user = await createUser()
    await setMyTimezone({ timezone: 'Europe/London' }, ctx(user))
    await setMyTimezone({ timezone: null }, ctx(user))
    expect(await settingsOf(user.id)).toMatchObject({ timezone: null, timezoneChosen: false })

    await syncBrowserTimezone({ timezone: 'Australia/Sydney' }, ctx(user))
    expect((await settingsOf(user.id))?.timezone).toBe('Australia/Sydney')
  })

  it('refuses a value that is not an IANA zone (400) and writes nothing', async () => {
    const user = await createUser()
    await expect(setMyTimezone({ timezone: 'sydney' }, ctx(user))).rejects.toMatchObject({ statusCode: 400 })
    expect(await settingsOf(user.id)).toBeNull()
  })

  it('refuses a caller who is not signed in (401)', async () => {
    await expect(setMyTimezone({ timezone: 'Europe/London' }, ctx())).rejects.toMatchObject({ statusCode: 401 })
  })
})
