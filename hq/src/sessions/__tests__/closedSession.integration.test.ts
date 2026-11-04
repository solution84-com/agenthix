/**
 * adr-0076 on hq's side, against the real test DB: a closed session takes no
 * new message and is never reopened.
 */
import { describe, it, expect, vi } from 'vitest'
import { prisma } from '../../test/db'
import { createUserWithRole, createWorkerSession } from '../../test/factories'
import { ctx } from './sessionActionsHarness'

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<any>('wasp/server')
  const { prisma } = await import('../../test/db')
  return { ...actual, prisma }
})
vi.mock('../../server/dashboard/debouncedPush', () => import('../../test/fakes/debouncedPush'))
vi.mock('../../server/dashboard/activity', () => import('../../test/fakes/activity'))
vi.mock('../../agents/dispatchService', () => import('../../test/fakes/dispatchService'))
vi.mock('../siteRuntimeStore', () => import('../../test/fakes/siteRuntimeStore'))

import { triggerAgentRun, updateSession } from '../actions'
import * as dispatchFake from '../../test/fakes/dispatchService'

async function closedChat() {
  const owner = await createUserWithRole('MEMBER')
  const session = await createWorkerSession({ userId: owner.id, status: 'CLOSED', closedReason: 'HARNESS_STATE_MISSING' })
  return { owner, session }
}

describe('a closed conversation', () => {
  it('refuses a new message with a clear error, and dispatches nothing', async () => {
    const { owner, session } = await closedChat()
    await expect(triggerAgentRun({ sessionId: session.id, inputText: 'hello?' }, ctx(owner)))
      .rejects.toMatchObject({ statusCode: 409, message: expect.stringContaining("no longer has this conversation's context") })
    expect(dispatchFake.dispatchedChatRuns).toEqual([])
  })

  it('still takes a message while it is open', async () => {
    const { owner, session } = await closedChat()
    await prisma.agentSession.update({ where: { id: session.id }, data: { status: 'ACTIVE', closedReason: null } })
    await expect(triggerAgentRun({ sessionId: session.id, inputText: 'hello' }, ctx(owner))).resolves.toMatchObject({ status: 'PENDING' })
  })

  it('cannot be reopened by setting it active again', async () => {
    const { owner, session } = await closedChat()
    await expect(updateSession({ id: session.id, status: 'ACTIVE' }, ctx(owner))).rejects.toMatchObject({ statusCode: 400 })
    expect((await prisma.agentSession.findUnique({ where: { id: session.id } }))?.status).toBe('CLOSED')
  })
})
