/**
 * A conversation's standing worker in one boundary for one person (workers and results spec, Workers): one harness
 * session of the conversation's agent, working in that boundary's storage with that boundary's authority, made the
 * first time the person commissions work there from the conversation and reused for their every later brief there.
 * A brief that names a workspace of the boundary has a worker of its own there, since a harness session keeps the
 * folder it started in: in a code workspace its runs work on the conversation's own branch (`runCodeWork.ts`).
 * It is hq's `AgentSession` row, a chat session of that person, marked with the conversation it serves, so its runs
 * act with that person's authority and memory; in a task's thread each person who briefs a boundary has their own.
 * It is never a conversation of its own and is listed nowhere as one. Started fresh past the high mark, the slot
 * gets a newer session (`freshStart.ts`); the slot's worker is always its newest.
 */
import { Prisma } from '@prisma/client'
import { prisma } from 'wasp/server'
import type { AgentSession } from '@prisma/client'
import { isConversationClosed, isHarnessStateLost, closedBecause } from '../../../shared/closedConversation'
import * as dispatchService from '../../../agents/dispatchService'
import { toSeed } from '../../../agents/dispatchPayloads'
import { chooseBoundaryRun } from '../../../agents/runModel'
import * as siteRuntimeStore from '../../../sessions/siteRuntimeStore'
import { Logger } from '../../../server/utils/logger'
import type { SharedBoundary } from '../../contract'

const logger = new Logger('StandingWorker')

/** `workspaceId`: the boundary's workspace the work is in, already checked to be the boundary's; null for its files. */
export type Slot = { conversationId: string; boundary: Pick<SharedBoundary, 'type' | 'id'>; personId: string; workspaceId: string | null }

type Db = Pick<Prisma.TransactionClient, 'agentSession'>

function slotWhere({ conversationId, boundary, personId, workspaceId }: Slot) {
  return { conversationId, primaryOwnerType: boundary.type, primaryOwnerId: boundary.id, userId: personId, primaryWorkspaceId: workspaceId }
}

/** The slot's worker: its newest session, the ones before it having been started fresh from. */
export function findWorker(slot: Slot, db: Db = prisma): Promise<AgentSession | null> {
  return db.agentSession.findFirst({ where: slotWhere(slot), orderBy: { workerGeneration: 'desc' } })
}

/** The slot a worker session fills; null for a session that is no conversation's worker. */
export function slotOf(session: Pick<AgentSession, 'conversationId' | 'primaryOwnerType' | 'primaryOwnerId' | 'userId' | 'primaryWorkspaceId'>): Slot | null {
  if (!session.conversationId || !session.primaryOwnerType || !session.primaryOwnerId) return null
  return {
    conversationId: session.conversationId,
    boundary: { type: session.primaryOwnerType, id: session.primaryOwnerId },
    personId: session.userId,
    workspaceId: session.primaryWorkspaceId,
  }
}

function slotKey({ conversationId, boundary, personId, workspaceId }: Slot): string {
  return `worker-slot:${conversationId}:${boundary.type}:${boundary.id}:${personId}:${workspaceId ?? ''}`
}

/**
 * Why the boundary's worker can take no brief, in the lead's words, or null when it can. A worker whose harness
 * state is gone is not closed in this sense: its slot gets a fresh one (`standingWorker`, `freshStart.ts`).
 */
export function workerClosedReason(session: Pick<AgentSession, 'status' | 'closedReason'>, boundaryName: string): string | null {
  if (!isConversationClosed(session) || isHarnessStateLost(session)) return null
  return `work in ${boundaryName} can't go on in this conversation: the agent's session there has closed because ${closedBecause(session.closedReason)}`
}

/**
 * A new session for the slot, of the given generation. Two made at once make one: both are made under the slot's
 * lock, and the second finds the first's (the unique slot and generation cannot, for a slot with no workspace).
 */
async function createWorker(slot: Slot, agent: { id: string; runtime: string | null }, title: string, generation: number): Promise<AgentSession> {
  let made: { session: AgentSession; isNew: boolean }
  try {
    made = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${slotKey(slot)}, 0))`
      const newest = await findWorker(slot, tx)
      if (newest && newest.workerGeneration >= generation) return { session: newest, isNew: false }
      const session = await tx.agentSession.create({
        data: {
          title,
          status: 'ACTIVE',
          sessionType: 'chat',
          runtime: agent.runtime,
          metadata: { agentId: agent.id },
          userId: slot.personId,
          agentId: agent.id,
          conversationId: slot.conversationId,
          primaryOwnerType: slot.boundary.type,
          primaryOwnerId: slot.boundary.id,
          primaryWorkspaceId: slot.workspaceId,
          workerGeneration: generation,
        },
      })
      return { session, isNew: true }
    })
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      const winner = await findWorker(slot)
      if (winner) return winner
    }
    throw err
  }
  if (!made.isNew) return made.session
  const session = made.session
  // The site learns of it now, as a new chat's does; a dispatch seeds it again, so a site out of reach here only delays it.
  try {
    await siteRuntimeStore.createSession(await dispatchService.resolveSiteIdForSession(session), toSeed(session))
  } catch (err) {
    logger.warn(`standing worker ${session.id} not yet on its site: ${err instanceof Error ? err.message : String(err)}`)
  }
  return session
}

/** The person's worker in this boundary for the conversation, made when there is none. */
export async function standingWorker(
  slot: Slot,
  agent: { id: string },
  title: string,
): Promise<AgentSession> {
  const existing = await findWorker(slot)
  if (!existing) {
    // A new worker starts on the runtime the resolved model runs on (models from one place, part 4).
    const { runtime } = await chooseBoundaryRun(slot.boundary, agent.id, slot.personId)
    return createWorker(slot, { id: agent.id, runtime }, title, 0)
  }
  return isHarnessStateLost(existing) ? freshWorker(existing, slot) : existing
}

/**
 * A new session for the slot of `worker`, which then takes the slot's briefs (long conversations spec, Workers and
 * tasks): its context starts empty, on `runtime` when given, else the worker's own. The old one keeps its runs and
 * their results. When another fresh start won, that one is the slot's worker.
 */
export async function freshWorker(worker: AgentSession, slot: Slot, runtime: string | null = null): Promise<AgentSession> {
  return createWorker(slot, { id: worker.agentId, runtime: runtime ?? worker.runtime }, worker.title ?? 'Work', worker.workerGeneration + 1)
}
