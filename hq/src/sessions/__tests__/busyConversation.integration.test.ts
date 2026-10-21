/**
 * Sending into a busy conversation (person-scoped execution spec §2), against
 * the real test DB: WAIT (the default) leaves a running turn alone; INTERRUPT
 * cancels every active run on the session before the new message is
 * dispatched. The person's choice is their own settings row; the site is the
 * shared fake.
 */
import { describe, it, expect, vi } from 'vitest'
import { prisma } from '../../test/db'
import { createUser, createUserWithRole, createAgent, createSession, createWorkerSession } from '../../test/factories'
import { ctx } from './sessionActionsHarness'

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<any>('wasp/server')
  const { prisma } = await import('../../test/db')
  return { ...actual, prisma }
})
vi.mock('../../agents/dispatchService', () => import('../../test/fakes/dispatchService'))
vi.mock('../siteRuntimeStore', () => import('../../test/fakes/siteRuntimeStore'))
vi.mock('../../server/dashboard/debouncedPush', () => import('../../test/fakes/debouncedPush'))
vi.mock('../../server/dashboard/activity', () => import('../../test/fakes/activity'))

import { triggerAgentRun } from '../actions'
import { interruptIfBusy } from '../busyConversationInterrupt'
import { SiteUnreachableError } from '../../storage/workspaceStore'
import * as dispatchFake from '../../test/fakes/dispatchService'
import * as siteStore from '../../test/fakes/siteRuntimeStore'

const SITE = 'site-1'

async function chatOf(mode: 'WAIT' | 'INTERRUPT' | null) {
  const owner = mode ? await createUserWithRole('MEMBER') : await createUser()
  if (mode) await prisma.userSettings.update({ where: { userId: owner.id }, data: { busyConversationMode: mode } })
  const session = await createWorkerSession({ userId: owner.id, agentId: (await createAgent()).id })
  return { owner, session }
}
const statusOf = async (runId: string) => (await siteStore.getRun(SITE, runId))?.status

describe('interruptIfBusy', () => {
  it('WAIT: leaves a running turn alone', async () => {
    const { owner, session } = await chatOf('WAIT')
    siteStore.addRun(SITE, { id: 'run-1', sessionId: session.id, status: 'RUNNING' })
    await expect(interruptIfBusy(owner.id, SITE, session.id)).resolves.toEqual({ interrupted: 0 })
    expect(await statusOf('run-1')).toBe('RUNNING')
  })

  it('no settings row yet: treated as WAIT, the schema default', async () => {
    const { owner, session } = await chatOf(null)
    siteStore.addRun(SITE, { id: 'run-1', sessionId: session.id, status: 'RUNNING' })
    await expect(interruptIfBusy(owner.id, SITE, session.id)).resolves.toEqual({ interrupted: 0 })
    expect(await statusOf('run-1')).toBe('RUNNING')
  })

  it('INTERRUPT: cancels every active run on the session (subagents too), as interrupted, and nothing else', async () => {
    const { owner, session } = await chatOf('INTERRUPT')
    siteStore.addRun(SITE, { id: 'run-1', sessionId: session.id, status: 'RUNNING' })
    siteStore.addRun(SITE, { id: 'run-2', sessionId: session.id, status: 'PENDING' })
    siteStore.addRun(SITE, { id: 'run-other', sessionId: 'another', status: 'RUNNING' })

    await expect(interruptIfBusy(owner.id, SITE, session.id)).resolves.toEqual({ interrupted: 2 })

    expect([await statusOf('run-1'), await statusOf('run-2'), await statusOf('run-other')]).toEqual(['CANCELLED', 'CANCELLED', 'RUNNING'])
    // Who interrupted it is recorded on the run (every-screen-reviewed spec §9).
    expect(siteStore.cancelRun).toHaveBeenCalledWith(SITE, 'run-1', 'interrupted', owner.id.slice(0, 8))
  })

  it('INTERRUPT with no turn running: nothing to cancel', async () => {
    const { owner, session } = await chatOf('INTERRUPT')
    await expect(interruptIfBusy(owner.id, SITE, session.id)).resolves.toEqual({ interrupted: 0 })
    expect(siteStore.cancelledRuns).toEqual([])
  })

  it('a site unreachable while checking propagates, rather than being swallowed as "nothing to cancel"', async () => {
    const { owner, session } = await chatOf('INTERRUPT')
    siteStore.makeSiteUnreachable(SITE)
    await expect(interruptIfBusy(owner.id, SITE, session.id)).rejects.toBeInstanceOf(SiteUnreachableError)
  })
})

describe('sending into a busy conversation @SC-692', () => {
  it('WAIT: sends, leaving the running turn alone', async () => {
    const { owner, session } = await chatOf('WAIT')
    siteStore.addRun(SITE, { id: 'run-old', sessionId: session.id, status: 'RUNNING' })
    await expect(triggerAgentRun({ sessionId: session.id, inputText: 'hi' }, ctx(owner))).resolves.toMatchObject({ status: 'PENDING' })
    expect(dispatchFake.dispatchedChatRuns.map((r) => r.sessionId)).toEqual([session.id])
    expect(await statusOf('run-old')).toBe('RUNNING')
  })

  it('INTERRUPT with a turn running: cancels it, and only then dispatches the new message', async () => {
    const { owner, session } = await chatOf('INTERRUPT')
    siteStore.addRun(SITE, { id: 'run-old', sessionId: session.id, status: 'RUNNING' })
    // The cancel is acknowledged before the new message dispatches — never the
    // reverse, which could race the new turn against the one being stopped.
    let oldRunAtDispatch: string | undefined
    dispatchFake.dispatchChatRun.mockImplementationOnce(async () => {
      oldRunAtDispatch = await statusOf('run-old')
      return { runId: 'run-new' }
    })

    await expect(triggerAgentRun({ sessionId: session.id, inputText: 'hi' }, ctx(owner))).resolves.toEqual({ id: 'run-new', status: 'PENDING' })
    expect(oldRunAtDispatch).toBe('CANCELLED')
  })

  it('INTERRUPT with no turn running: behaves exactly as a normal send', async () => {
    const { owner, session } = await chatOf('INTERRUPT')
    await expect(triggerAgentRun({ sessionId: session.id, inputText: 'hi' }, ctx(owner))).resolves.toMatchObject({ status: 'PENDING' })
    expect(dispatchFake.dispatchedChatRuns).toHaveLength(1)
    expect(siteStore.cancelledRuns).toEqual([])
  })

  it('a site unreachable while checking for active runs fails explicitly (503), rather than silently sending', async () => {
    const { owner, session } = await chatOf('INTERRUPT')
    siteStore.makeSiteUnreachable(SITE)
    await expect(triggerAgentRun({ sessionId: session.id, inputText: 'hi' }, ctx(owner))).rejects.toMatchObject({ statusCode: 503 })
    expect(dispatchFake.dispatchedChatRuns).toEqual([])
  })
})
