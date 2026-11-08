/**
 * Dispatching one routine run (adr-0177): a session of its own, in the routine's project's storage and on behalf of
 * the run's person, then the same chat dispatch every run with no task takes (dispatchService.ts's `dispatchChatRun`),
 * named as the routine's so the site records it on its run.
 *
 * The session is a chat's, its person the run's: like any chat it is that person's to read, answer and stop
 * (sessionEntitlement.ts), and the control plane reads the run as on their behalf (runOnBehalfOf.ts). Its id and
 * site are recorded on the routine run before the dispatch, so a frame that beats the dispatch's answer still finds it.
 */
import { prisma } from 'wasp/server'
import type { Agent, Routine } from '@prisma/client'
import { dispatchChatRun } from '../agents/dispatchService'
import { resolveSiteIdForSession } from '../agents/dispatchSiteResolution'
import { runBoundary } from '../agents/overrides/agentOverrideService'
import { chooseBoundaryRun } from '../agents/runModel'
import { runLimitsFor } from '../agents/runLimits/runLimitsService'
import { parseChoiceValue } from '../conversations/access/talkingModel'
import { placeStorageOf } from '../projects/personalProject'

export type RoutineRunStart = {
  routine: Pick<Routine, 'id' | 'projectId' | 'title' | 'instructions' | 'modelChoice'>
  agent: Agent
  routineRunId: string
  number: number
  /** The person the run is on behalf of. */
  personId: string
  startedBy: 'person' | 'schedule'
}

/** What the agent is asked: the routine's instructions, under its name. */
export function routineRunInput(title: string, instructions: string): string {
  const body = instructions.trim() || 'No instructions were given.'
  return `This is a run of the routine "${title}". Do what its instructions say:\n\n${body}`
}

export async function dispatchRoutineRun(s: RoutineRunStart): Promise<{ runId: string; sessionId: string; siteId: string }> {
  const project = await prisma.project.findUniqueOrThrow({
    where: { id: s.routine.projectId }, select: { id: true, personalOwnerId: true, personalSpace: true },
  })
  const storage = placeStorageOf(project)
  const location = { taskId: null, primaryOwnerType: storage.ownerType, primaryOwnerId: storage.ownerId, primaryWorkspaceId: null }
  const pick = parseChoiceValue(s.routine.modelChoice)
  const boundary = await runBoundary({ ...location, userId: s.personId, sessionType: 'chat' })
  const choice = await chooseBoundaryRun(boundary, s.agent.id, s.personId, pick)
  const session = await prisma.agentSession.create({
    data: {
      title: `${s.routine.title} · run ${s.number}`,
      status: 'ACTIVE',
      sessionType: 'chat',
      runtime: choice.runtime,
      model: choice.model || null,
      metadata: { agentId: s.agent.id, routineId: s.routine.id, routineRunId: s.routineRunId },
      userId: s.personId,
      agentId: s.agent.id,
      ...location,
    },
  })
  const siteId = await resolveSiteIdForSession(session)
  const { timeLimitMinutes } = await runLimitsFor(boundary)
  await prisma.routineRun.update({ where: { id: s.routineRunId }, data: { sessionId: session.id, siteId, timeLimitMinutes } })
  const { runId } = await dispatchChatRun(session.id, routineRunInput(s.routine.title, s.routine.instructions), s.agent, null, {
    senderId: s.personId,
    routine: { routineId: s.routine.id, startedBy: s.startedBy, pick },
  })
  return { runId, sessionId: session.id, siteId }
}
