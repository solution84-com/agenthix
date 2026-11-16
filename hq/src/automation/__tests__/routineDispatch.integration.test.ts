/**
 * One routine run's dispatch (adr-0177) against the real test database: a chat session of its own in the project's
 * storage, its person the run's, recorded on the routine run before the run is sent; then the chat dispatch, named
 * as the routine's, with the routine's model as the pick. The model resolver and the run's limits are replaced.
 */
import { describe, it, expect, vi } from 'vitest'
import { prisma } from '../../test/db'

vi.mock('wasp/server', async () => {
  const { prisma } = await import('../../test/db')
  return { prisma, Prisma: (await import('@prisma/client')).Prisma }
})
vi.mock('../../agents/dispatchService', () => import('../../test/fakes/dispatchService'))
vi.mock('../../agents/dispatchSiteResolution', async () => {
  const fake = await import('../../test/fakes/dispatchService')
  return { resolveSiteIdForSession: fake.resolveSiteIdForSession, resolveSiteIdForTask: fake.resolveSiteIdForTask }
})
vi.mock('../../agents/runModel', () => ({
  chooseBoundaryRun: vi.fn(async () => ({ model: 'claude-sonnet', runtime: 'claude-sdk', resolution: null, problem: null })),
}))
vi.mock('../../agents/runLimits/runLimitsService', () => ({ runLimitsFor: vi.fn(async () => ({ timeLimitMinutes: 45, turnLimit: 50 })) }))

import * as dispatchFake from '../../test/fakes/dispatchService'
import { dispatchRoutineRun, routineRunInput } from '../routineDispatch'
import { createProjectWithUsers, routineIn } from './automationWorld'

describe("a routine run's dispatch", () => {
  it("runs in a chat session of its own, the run's person's, in the project's storage, and names the routine", async () => {
    const { project, users } = await createProjectWithUsers()
    const agent = await prisma.agent.create({ data: { id: 'agent-1', name: 'Reviewer', handle: 'reviewer' } })
    const routine = await routineIn(project.id, users.person.id, { agentId: agent.id, modelChoice: 'anthropic/claude-opus' })
    const run = await prisma.routineRun.create({ data: { routineId: routine.id, number: 3, onBehalfOfUserId: users.member.id, state: 'STARTING' } })
    vi.mocked(dispatchFake.resolveSiteIdForSession).mockResolvedValue('site-7')
    vi.mocked(dispatchFake.dispatchChatRun).mockResolvedValue({ runId: 'run-9' })

    const started = await dispatchRoutineRun({ routine, agent, routineRunId: run.id, number: 3, personId: users.member.id, startedBy: 'person' })

    const session = await prisma.agentSession.findUniqueOrThrow({ where: { id: started.sessionId } })
    expect(session).toMatchObject({
      sessionType: 'chat', taskId: null, userId: users.member.id, agentId: agent.id, runtime: 'claude-sdk', conversationId: null,
      primaryOwnerType: 'project', primaryOwnerId: project.id, primaryWorkspaceId: null,
      metadata: expect.objectContaining({ routineId: routine.id, routineRunId: run.id }),
    })
    expect(await prisma.routineRun.findUniqueOrThrow({ where: { id: run.id } })).toMatchObject({ sessionId: session.id, siteId: 'site-7', timeLimitMinutes: 45 })
    expect(dispatchFake.dispatchChatRun).toHaveBeenCalledWith(session.id, routineRunInput(routine.instructions), agent, null, {
      senderId: users.member.id,
      routine: { routineId: routine.id, startedBy: 'person', pick: { providerId: 'anthropic', model: 'claude-opus' } },
    })
    expect(started).toEqual({ runId: 'run-9', sessionId: session.id, siteId: 'site-7' })
  })

  it('asks the agent its instructions as written, and nothing else @SC-2183', () => {
    expect(routineRunInput('Check the links.')).toBe('Check the links.')
    expect(routineRunInput('  ')).toMatch(/No instructions were given/)
  })
})
