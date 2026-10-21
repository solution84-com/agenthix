/**
 * The person a run is on behalf of, so a task the run creates is on behalf of
 * them too (adr-0089) — followed up the chain, so it always ends at a person.
 *
 * A run a person started in a task — Run, or a message into the task's
 * session — is on their behalf, read from the capability's signed
 * `onBehalfOfUserId`. A task run nobody started is on its task's person. A chat
 * is on behalf of the person whose conversation it is. The capability's
 * `userId` is not used for a task run: a task session's owner is a routing
 * identity, not the person the work is for (dispatchService's `dispatchTaskRun`).
 * `personOfRun` is that one answer, for every check made against the run's
 * person (adr-0101).
 */
import { prisma } from 'wasp/server'
import { parseCapabilityOnBehalfOf, type CapabilityClaims } from '@agenthix/core'
import { ControlPlaneError, type CallerContext } from './types'
import {
  originByAgentRun, originByConnection, originByPerson, personMayWorkInProject, personQueuer, type Queuer, type TaskOrigin,
} from '../../projects/taskOnBehalfOf'

export async function originOfRun(ctx: CallerContext, projectId: string, what: string): Promise<TaskOrigin> {
  // A connection is its person acting (adr-0090): the task is on their behalf, through it.
  if (ctx.kind === 'connection') {
    const { userId, connectionId } = ctx.connection
    if (!(await personMayWorkInProject(projectId, userId))) {
      throw new ControlPlaneError('forbidden', `${what}: this connection's person cannot work in this project`)
    }
    return originByConnection(userId, connectionId)
  }
  // A turn asks for the person whose message it answers, as that person would on the board.
  if (ctx.kind === 'turn') {
    const person = ctx.turn.actingUserId
    if (!person) throw new ControlPlaneError('forbidden', `${what}: this turn acts for no one, so it may only read`)
    if (!(await personMayWorkInProject(projectId, person))) {
      throw new ControlPlaneError('forbidden', `${what}: the person this conversation acts for cannot work in this project`)
    }
    return originByPerson(person)
  }
  const { claims } = ctx
  const session = await sessionOf(claims.sessionId)
  if (!session) throw new ControlPlaneError('not_found', `Session ${claims.sessionId} not found`)

  const person = await personOfRun(claims, session)
  if (!person) throw new ControlPlaneError('forbidden', `${what}: this run is not on behalf of any person`)
  if (!(await personMayWorkInProject(projectId, person))) {
    throw new ControlPlaneError('forbidden', `${what}: the person this run is on behalf of cannot work in this project`)
  }
  return originByAgentRun(person, claims.agentId, claims.sessionId)
}

type RunSession = { sessionType: string; taskId: string | null }

function sessionOf(sessionId: string): Promise<RunSession | null> {
  return prisma.agentSession.findUnique({ where: { id: sessionId }, select: { sessionType: true, taskId: true } })
}

/**
 * Who a run is on behalf of, or null for no one (adr-0095): the person signed
 * into its capability; else, for a run in a task, the task's person; else, for
 * a chat, its own person. A chat's person is the capability's `userId`, which
 * hq signs from the session's owner. No one is behind a run whose task is gone
 * or whose session is neither a task's nor a chat.
 *
 * `session` is read here when the caller has not already read it. A task's id
 * is taken from the capability first, so a task run never depends on the row.
 */
export async function personOfRun(claims: CapabilityClaims, session?: RunSession | null): Promise<string | null> {
  const signed = parseCapabilityOnBehalfOf(claims.onBehalfOfUserId)
  if (signed) return signed
  if (claims.taskId) return taskPerson(claims.taskId)
  if (session === undefined && (typeof claims.sessionId !== 'string' || !claims.sessionId)) return null
  const row = session === undefined ? await sessionOf(claims.sessionId) : session
  if (!row) return null
  if (row.taskId) return taskPerson(row.taskId)
  return row.sessionType === 'chat' && typeof claims.userId === 'string' && claims.userId ? claims.userId : null
}

/** A task's person. The task's record of who last started it is not read: it may belong to another run than this one. */
async function taskPerson(taskId: string): Promise<string | null> {
  const task = await prisma.task.findUnique({ where: { id: taskId }, select: { onBehalfOfUserId: true } })
  return task?.onBehalfOfUserId ?? null
}

/** Who is queueing a task through this call: the run's agent, a connection's person through it, or a turn's person. */
export function callerQueuer(ctx: CallerContext): Queuer {
  if (ctx.kind === 'connection') {
    return { kind: 'person', userId: ctx.connection.userId, connectionId: ctx.connection.connectionId }
  }
  if (ctx.kind === 'turn') {
    if (!ctx.turn.actingUserId) throw new ControlPlaneError('forbidden', 'This turn acts for no one, so it may only read')
    return personQueuer(ctx.turn.actingUserId)
  }
  return { kind: 'agent', agentId: ctx.claims.agentId, sessionId: ctx.claims.sessionId }
}
