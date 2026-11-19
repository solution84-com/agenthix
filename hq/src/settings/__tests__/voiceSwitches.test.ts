import { describe, it, expect, vi } from 'vitest'

vi.mock('wasp/server', () => {
  class HttpError extends Error { constructor(public statusCode: number, message: string) { super(message) } }
  return { prisma: {}, HttpError }
})
vi.mock('../../github/githubApp', () => ({ refreshInstallations: vi.fn(), disconnectApp: vi.fn() }))
vi.mock('../../packages/orgPackageService', () => ({ changeOrgPackage: vi.fn(), prepareOrgPackage: vi.fn() }))
vi.mock('../../server/roomAccess', () => ({ leaveRoomsNoLongerAllowed: vi.fn() }))
vi.mock('../../pictures/service', () => ({ redrawIfFollowsName: vi.fn() }))

import { updateUserSettings } from '../actions'

function run(args: Record<string, unknown>) {
  const upsert = vi.fn(async (a: unknown) => a)
  const result = updateUserSettings(args as never, { user: { id: 'u1' }, entities: { UserSettings: { upsert } } } as never)
  return { upsert, result }
}

describe('the Hums and Expressive tone switches @SC-2241', () => {
  it('saves each as the person sent it, on the row that exists and on the one first made', async () => {
    const { upsert, result } = run({ voiceHums: false, voiceExpressiveTone: false })
    await result
    const call = upsert.mock.calls[0][0] as { update: object; create: object }
    expect(call.update).toEqual({ voiceHums: false, voiceExpressiveTone: false })
    expect(call.create).toMatchObject({ userId: 'u1', voiceHums: false, voiceExpressiveTone: false })
  })

  it('leaves the other one alone when only one is sent', async () => {
    const { upsert, result } = run({ voiceHums: true })
    await result
    expect((upsert.mock.calls[0][0] as { update: object }).update).toEqual({ voiceHums: true })
  })

  it('refuses a value that is not on or off (400), saving nothing', async () => {
    const hums = run({ voiceHums: 'no' })
    await expect(hums.result).rejects.toMatchObject({ statusCode: 400, message: 'Hums are on or off' })
    const tone = run({ voiceExpressiveTone: 0 })
    await expect(tone.result).rejects.toMatchObject({ statusCode: 400, message: 'Expressive tone is on or off' })
    expect(hums.upsert).not.toHaveBeenCalled()
    expect(tone.upsert).not.toHaveBeenCalled()
  })
})
