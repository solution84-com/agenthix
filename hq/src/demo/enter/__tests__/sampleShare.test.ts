/** What a visitor is given of the sample as they enter, with the transaction replaced (the database test is enterDemo's). */
import { describe, expect, it, vi } from 'vitest'
import type { Prisma } from '@prisma/client'

const written = vi.hoisted(() => ({ members: [] as unknown[] }))
vi.mock('../../../org/teams/writeThrough', () => ({
  writePerson: async (_tx: unknown, projectId: string, userId: string, role: string) => { written.members.push({ projectId, userId, role }) },
}))

import { shareTheSample } from '../sampleShare'

type Asked = { model: string; method: string; args: Record<string, any> } // eslint-disable-line @typescript-eslint/no-explicit-any -- recorded Prisma arguments are any shape

function fakeTx(answers: Record<string, unknown>) {
  const asked: Asked[] = []
  const tx = new Proxy({}, {
    get: (_t, model: string) => new Proxy({}, {
      get: (_m, method: string) => async (args: Record<string, unknown>) => {
        asked.push({ model, method, args })
        return answers[`${model}.${method}`] ?? null
      },
    }),
  }) as unknown as Prisma.TransactionClient
  return { tx, asked }
}

describe("a visitor's share of the sample", () => {
  it("makes them a viewer of every sample project, none personal, and copies the admins' pins once each in order @SC-1951 @SC-1953", async () => {
    written.members = []
    const { tx, asked } = fakeTx({
      'project.findMany': [{ id: 'web' }, { id: 'qtr' }],
      'userSettings.findMany': [{ userId: 'sam' }],
      'pin.findMany': [{ itemId: 'qtr' }, { itemId: 'web' }, { itemId: 'qtr' }],
    })
    expect(await shareTheSample(tx, 'me')).toEqual({ projects: 2, pins: 2 })
    expect(written.members).toEqual([{ projectId: 'web', userId: 'me', role: 'VIEWER' }, { projectId: 'qtr', userId: 'me', role: 'VIEWER' }])
    expect(asked.find(a => a.model === 'project')!.args.where).toEqual({ personalOwnerId: null })
    const pins = asked.find(a => a.model === 'pin' && a.method === 'createMany')!
    expect(pins.args.data).toEqual([{ userId: 'me', kind: 'PROJECT', itemId: 'qtr', position: 0 }, { userId: 'me', kind: 'PROJECT', itemId: 'web', position: 1 }])
  })

  it("copies none of the admins' notifications: a viewer can act on none of them @SC-1953", async () => {
    const { tx, asked } = fakeTx({ 'project.findMany': [{ id: 'web' }], 'userSettings.findMany': [{ userId: 'sam' }], 'pin.findMany': [] })
    await shareTheSample(tx, 'me')
    expect(asked.some(a => a.model === 'notification')).toBe(false)
  })

  it('copies no pins with no admin of the sample @SC-1953', async () => {
    written.members = []
    const none = fakeTx({ 'project.findMany': [], 'userSettings.findMany': [] })
    expect(await shareTheSample(none.tx, 'me')).toEqual({ projects: 0, pins: 0 })
    expect(none.asked.some(a => a.method === 'createMany')).toBe(false)
  })
})
