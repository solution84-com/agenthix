/**
 * Held instructions (person-scoped execution spec §4, "A site that is
 * offline"): written first, sent at once to a connected site, marked done only
 * on the site's acknowledgement, and replayed in order on reconnect — against
 * the real test database, so `sequence` order and the unacknowledged filter are
 * the database's. Only the live channel is replaced: a test holds rows, drops
 * the connection, reconnects, and watches what is sent.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { prisma } from '../../test/db'

const h = vi.hoisted(() => ({
  online: new Set<string>(),
  request: vi.fn(),
}))

vi.mock('../channel', () => {
  class ChannelRequestFailed extends Error {
    constructor(message: string, readonly code: string) { super(message) }
  }
  return {
    ChannelRequestFailed,
    siteChannelRegistry: {
      isOnline: (siteId: string) => h.online.has(siteId),
      request: h.request,
    },
  }
})

vi.mock('wasp/server', async () => {
  const { prisma } = await import('../../test/db')
  return { prisma }
})

import {
  heldInstructionRows,
  deliverHeldInstructions,
  deliverHeldInstructionsTo,
  sitesToInstruct,
} from '../heldInstructions'
import { ChannelRequestFailed } from '../channel'

async function makeSites(...specs: Array<[string, string?]>) {
  for (const [siteId, status = 'ONLINE'] of specs) {
    await prisma.executionSite.create({ data: { siteId, label: siteId, status } })
  }
}

/** Holds one instruction the way a membership change does: rows from heldInstructionRows, written with createMany. */
async function hold(siteId: string, userId: string, projectId = 'p1') {
  const rows = heldInstructionRows([siteId], { method: 'membership.memberLeftProject', params: { userId, projectId } })
  await prisma.heldSiteInstruction.createMany({ data: rows })
  return rows[0]!.id!
}
const read = (id: string) => prisma.heldSiteInstruction.findUniqueOrThrow({ where: { id } })
const acknowledged = async (ids: string[]) => Promise.all(ids.map(async id => (await read(id)).acknowledgedAt !== null))

/** A site that acknowledges everything it is sent. */
function acknowledging() {
  h.request.mockImplementation(async (_siteId: string, _method: string, params: { instructionId: string }) => ({
    instructionId: params.instructionId,
    acknowledged: true,
  }))
}

const sentUsers = () => h.request.mock.calls.map(c => (c[2] as { userId: string }).userId)

beforeEach(async () => {
  h.online.clear()
  h.request.mockReset()
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
  await makeSites(['a'], ['b'])
})

describe('heldInstructionRows', () => {
  it('gives each site its own row, whose params carry the row id as instructionId', () => {
    const rows = heldInstructionRows(['a', 'b'], { method: 'membership.projectDeleted', params: { projectId: 'p1' } })
    expect(rows.map(r => r.siteId)).toEqual(['a', 'b'])
    for (const row of rows) {
      expect(row.method).toBe('membership.projectDeleted')
      expect(row.params).toEqual({ projectId: 'p1', instructionId: row.id })
    }
    expect(rows[0]!.id).not.toBe(rows[1]!.id)
  })
})

describe('sitesToInstruct', () => {
  it('keeps each known, unrevoked site once, and drops unknown ids and nulls', async () => {
    await makeSites(['c', 'OFFLINE'], ['r', 'REVOKED'])
    expect(await sitesToInstruct(['a', null, 'c', 'a', 'r', 'unknown'])).toEqual(['a', 'c'])
  })

  it('asks nothing when there is nothing to ask about', async () => {
    expect(await sitesToInstruct([null])).toEqual([])
  })
})

describe('deliverHeldInstructions', () => {
  it('sends a connected site its instruction at once and marks it acknowledged', async () => {
    const id = await hold('a', 'u1')
    h.online.add('a')
    acknowledging()

    await deliverHeldInstructions('a')

    expect(h.request).toHaveBeenCalledWith(
      'a', 'membership.memberLeftProject', { userId: 'u1', projectId: 'p1', instructionId: id }, expect.any(Number),
    )
    expect(await read(id)).toMatchObject({ acknowledgedAt: expect.any(Date), attempts: 1, lastAttemptAt: expect.any(Date), lastError: null })
  })

  it('keeps everything for an offline site, and sends it all in order when the site reconnects', async () => {
    const ids = [await hold('a', 'u1'), await hold('b', 'other-site'), await hold('a', 'u2'), await hold('a', 'u3')]
    acknowledging()

    await deliverHeldInstructions('a')
    expect(h.request).not.toHaveBeenCalled()
    expect((await prisma.heldSiteInstruction.findMany()).every(r => r.attempts === 0 && r.acknowledgedAt === null)).toBe(true)

    h.online.add('a')
    await deliverHeldInstructions('a')

    expect(sentUsers()).toEqual(['u1', 'u2', 'u3'])
    expect(await acknowledged(ids)).toEqual([true, false, true, true])
  })

  it('never sends an acknowledged instruction again', async () => {
    await hold('a', 'u1')
    h.online.add('a')
    acknowledging()

    await deliverHeldInstructions('a')
    await deliverHeldInstructions('a')

    expect(h.request).toHaveBeenCalledTimes(1)
  })

  it('does not count an answer that names another instruction as an acknowledgement', async () => {
    const id = await hold('a', 'u1')
    h.online.add('a')
    h.request.mockResolvedValue({ instructionId: 'something-else', acknowledged: true })

    await deliverHeldInstructions('a')

    expect(await read(id)).toMatchObject({ acknowledgedAt: null, lastError: expect.stringMatching(/did not acknowledge/) })
  })

  it('keeps a failed send and the ones after it, and retries them in order on the next reconnect', async () => {
    const ids = [await hold('a', 'u1'), await hold('a', 'u2'), await hold('a', 'u3')]
    h.online.add('a')
    acknowledging()
    h.request.mockImplementationOnce(async (_s: string, _m: string, params: { instructionId: string }) => ({
      instructionId: params.instructionId, acknowledged: true,
    }))
    h.request.mockImplementationOnce(async () => { throw new ChannelRequestFailed('Connection closed', 'disconnected') })

    await deliverHeldInstructions('a')

    // The connection went at u2: u3 is not attempted on a socket that is gone.
    expect(sentUsers()).toEqual(['u1', 'u2'])
    expect(await acknowledged(ids)).toEqual([true, false, false])
    expect((await read(ids[1]!)).lastError).toBe('Connection closed')
    expect((await read(ids[2]!)).attempts).toBe(0)

    h.request.mockClear()
    await deliverHeldInstructions('a')

    expect(sentUsers()).toEqual(['u2', 'u3'])
    expect(await acknowledged(ids)).toEqual([true, true, true])
    expect((await read(ids[1]!)).attempts).toBe(2)
  })

  it('an instruction the site refuses is kept for the next reconnect, and the later ones still go', async () => {
    const ids = [await hold('a', 'u1'), await hold('a', 'u2')]
    h.online.add('a')
    acknowledging()
    h.request.mockImplementationOnce(async () => { throw new ChannelRequestFailed('handler failed', 'internal') })

    await deliverHeldInstructions('a')

    expect(sentUsers()).toEqual(['u1', 'u2'])
    expect(await read(ids[0]!)).toMatchObject({ acknowledgedAt: null, lastError: 'handler failed' })
    expect(await acknowledged([ids[1]!])).toEqual([true])
  })

  it('a reconnect and a membership change arriving together send each instruction once, in order', async () => {
    await hold('a', 'u1')
    await hold('a', 'u2')
    h.online.add('a')
    let release!: () => void
    const gate = new Promise<void>(resolve => { release = resolve })
    h.request.mockImplementation(async (_s: string, _m: string, params: { instructionId: string }) => {
      await gate
      return { instructionId: params.instructionId, acknowledged: true }
    })

    const fromReconnect = deliverHeldInstructions('a')
    const fromChange = deliverHeldInstructionsTo(['a'])
    release()
    await Promise.all([fromReconnect, fromChange])

    expect(sentUsers()).toEqual(['u1', 'u2'])
  })

  it('never throws, even when the table cannot be read', async () => {
    h.online.add('a')
    const findMany = vi.spyOn(prisma.heldSiteInstruction, 'findMany').mockRejectedValueOnce(new Error('database down'))

    await expect(deliverHeldInstructions('a')).resolves.toBeUndefined()
    expect(findMany).toHaveBeenCalled()
    findMany.mockRestore()
  })
})
