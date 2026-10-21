/**
 * When membership ends (person-scoped execution spec §4): hq tells this site
 * that a person left a project, left the organisation, or that a project was
 * deleted, and this site takes away what was private to them here.
 *
 * Each instruction, in this order:
 *   1. closes the conversations in scope, so none can launch again (the
 *      pre-launch check refuses a CLOSED session);
 *   2. cancels their runs still pending or running, through the engine's own
 *      cancel path;
 *   3. ends each conversation: its processes, its harness's hold on it, its
 *      staging and its platform token (adr-0083);
 *   4. removes their containers, waiting for cancelled runs to leave them;
 *   5. deletes the harness homes;
 *   6. tells hq each conversation is closed, since no run frame carries it;
 *   7. answers with the acknowledgement.
 *
 * Every step is idempotent, so the same instruction replayed after a lost
 * acknowledgement does no harm. A step that fails throws, the channel answers
 * with an error, and hq sends the instruction again when this site next
 * connects. The member folder and our record of the conversations — their
 * transcript, runs and tool calls — are left alone; only a session's status
 * changes.
 */
import fs from 'node:fs/promises'
import { z } from 'zod'
import { prisma } from '#db'
import type { Prisma } from '@prisma/client'
import {
  MEMBERSHIP_METHODS,
  SESSION_PATCH_EVENT,
  type MembershipAck,
  type SessionClosedReasonValue,
  type SessionPatchEvent,
} from '@agenthix/core'
import { agentEngine } from '../../agents/runtime/AgentEngine'
import { agentContainerManager } from '../../agents/runtime/AgentContainerManager'
import { conversationLifecycle } from '../../agents/runtime/conversationLifecycle'
import type { ContainerRemovalFilter } from '../../agents/runtime/containerRemoval'
import {
  personHarnessHomesRoot,
  personProjectHarnessHome,
  projectHarnessHomes,
} from '../../agents/runtime/harnessHomes'
import { hqConnectionManager } from '../hq/hqConnection'
import { Logger } from '../utils/logger'

const logger = new Logger('MembershipEnding')

/** How long a cancelled run may take to leave its container. Under hq's 120 s wait for the answer. */
export const RUN_EXIT_WAIT_MS = 60_000
const RUN_EXIT_POLL_MS = 500

type Scope = {
  /** The conversations the instruction ends. */
  sessions: Prisma.AgentSessionWhereInput
  containers: ContainerRemovalFilter
  homes: () => Promise<string[]>
  reason: SessionClosedReasonValue
}

const id = z.string().min(1)
const memberLeftProject = z.object({ instructionId: id, userId: id, projectId: id })
const personLeftOrganisation = z.object({ instructionId: id, userId: id })
const projectDeleted = z.object({ instructionId: id, projectId: id })

function parse<T>(schema: z.ZodType<T>, params: unknown, method: string): T {
  const parsed = schema.safeParse(params)
  if (!parsed.success) throw new Error(`${method} was called with parameters it does not accept`)
  return parsed.data
}

/**
 * Only chats run as a person (a task runs as the project), so a person's
 * leaving ends their chats, never a task session that merely names them.
 */
export async function handleMemberLeftProject(params: unknown): Promise<MembershipAck> {
  const p = parse(memberLeftProject, params, MEMBERSHIP_METHODS.memberLeftProject)
  await endScope({
    sessions: { userId: p.userId, sessionType: 'chat', primaryOwnerType: 'project', primaryOwnerId: p.projectId },
    containers: { ownerType: 'project', ownerId: p.projectId, runner: { kind: 'person', userId: p.userId } },
    homes: async () => [personProjectHarnessHome(p.userId, p.projectId)],
    reason: 'LEFT_PROJECT',
  })
  return { instructionId: p.instructionId, acknowledged: true }
}

/** Every project and their own storage: every container they run in, and their whole home tree. */
export async function handlePersonLeftOrganisation(params: unknown): Promise<MembershipAck> {
  const p = parse(personLeftOrganisation, params, MEMBERSHIP_METHODS.personLeftOrganisation)
  await endScope({
    sessions: { userId: p.userId, sessionType: 'chat' },
    containers: { runner: { kind: 'person', userId: p.userId } },
    homes: async () => [personHarnessHomesRoot(p.userId)],
    reason: 'LEFT_ORGANISATION',
  })
  return { instructionId: p.instructionId, acknowledged: true }
}

/** Every conversation in the project, tasks' included; its own home and every member's. */
export async function handleProjectDeleted(params: unknown): Promise<MembershipAck> {
  const p = parse(projectDeleted, params, MEMBERSHIP_METHODS.projectDeleted)
  await endScope({
    sessions: { primaryOwnerType: 'project', primaryOwnerId: p.projectId },
    containers: { ownerType: 'project', ownerId: p.projectId },
    homes: () => projectHarnessHomes(p.projectId),
    reason: 'PROJECT_DELETED',
  })
  return { instructionId: p.instructionId, acknowledged: true }
}

async function endScope(scope: Scope): Promise<void> {
  const sessions = await prisma.agentSession.findMany({ where: scope.sessions, select: { id: true, runtime: true } })
  const sessionIds = sessions.map(s => s.id)

  // A conversation already closed keeps the reason it closed for.
  if (sessionIds.length > 0) {
    await prisma.agentSession.updateMany({
      where: { id: { in: sessionIds }, status: { not: 'CLOSED' } },
      data: { status: 'CLOSED', closedReason: scope.reason },
    })
    const active = await prisma.agentRun.findMany({
      where: { sessionId: { in: sessionIds }, status: { in: ['PENDING', 'RUNNING'] } },
      select: { id: true },
    })
    for (const run of active) await agentEngine.cancelRun(run.id)
    await Promise.all(sessions.map(session =>
      conversationLifecycle.endConversation(session.id, { runtimeName: session.runtime })))
  }

  await removeContainersOnceIdle(scope.containers)
  for (const home of await scope.homes()) await fs.rm(home, { recursive: true, force: true })

  if (sessionIds.length > 0) await reportClosed(sessionIds)
}

/**
 * A cancelled run leaves its container only once its process has unwound, and
 * removal refuses a container with a run in it. So it is retried until the
 * runs have gone, and the last refusal is thrown if they have not.
 */
async function removeContainersOnceIdle(filter: ContainerRemovalFilter): Promise<void> {
  const deadline = Date.now() + RUN_EXIT_WAIT_MS
  for (;;) {
    try {
      await agentContainerManager.removeContainersFor(filter)
      return
    } catch (err) {
      if (Date.now() >= deadline) throw err
      logger.info(`waiting for runs to leave containers: ${err instanceof Error ? err.message : String(err)}`)
      await new Promise(resolve => setTimeout(resolve, RUN_EXIT_POLL_MS))
    }
  }
}

/**
 * Sent for every conversation in scope, including those closed by an earlier
 * delivery of this instruction, so a replay repeats what a lost frame dropped.
 * Sent before the acknowledgement, on the same socket.
 */
async function reportClosed(sessionIds: string[]): Promise<void> {
  const closed = await prisma.agentSession.findMany({
    where: { id: { in: sessionIds }, status: 'CLOSED' },
    select: { id: true, closedReason: true },
  })
  for (const session of closed) {
    if (!session.closedReason) continue
    const event: SessionPatchEvent = {
      sessionId: session.id,
      sessionPatch: { status: 'CLOSED', closedReason: session.closedReason },
    }
    hqConnectionManager.sendEvent(SESSION_PATCH_EVENT, event)
  }
}
