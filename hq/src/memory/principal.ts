/**
 * Who a memory tool call reads and writes for (memory and knowledge spec, What changes from today): one rule for
 * every run and turn. The person it is for is the author of the message that commissioned it — a chat's person, a
 * person's own Run of a task, the sender of a message into a task's session, the person a conversation's turn
 * answers — and a run nobody commissioned, a pulse or a schedule's, is for no person and reaches no memory (ADR-0188).
 * Its place is where it works: the project, or the person's own space.
 *
 * This replaces both of today's gates — the dispatch-time invoker and the capability's role — for memory; neither
 * is read here. Nothing about who is asking is read from the call's arguments.
 */
import { prisma } from 'wasp/server'
import type { CapabilityClaims } from '@agenthix/core'
import { ControlPlaneError, type CallerContext, type TurnCaller } from '../server/controlplane/types'
import { personOfRun } from '../server/controlplane/runOnBehalfOf'
import { personalOwnerOf } from '../projects/personalProject'
import type { MemoryPrincipal, Place } from './contract'
import { personOfTurnHome } from './scopes'

/** A project's place, or its person's own space for a personal project, whose work is that person's. */
async function placeOfProject(projectId: string): Promise<Place> {
  const owner = await personalOwnerOf(projectId)
  return owner ? { type: 'user', id: owner } : { type: 'project', id: projectId }
}

/**
 * Only a run a person or an agent working for one started is for a person; a pulse's or a schedule's is not. Nor
 * is a run in a home other members' runs share — a project's task runs, whose files and transcripts every run of
 * that project can read — so a person's memory is reached only from a run in that person's own home.
 */
async function runPerson(claims: CapabilityClaims): Promise<string | null> {
  if (claims.startedBy !== 'person' && claims.startedBy !== 'agent') return null
  if (claims.runner?.kind !== 'person') return null
  const person = await personOfRun(claims)
  return person === claims.runner.userId ? person : null
}

async function runPlace(claims: CapabilityClaims): Promise<Place | null> {
  if (claims.projectId) return placeOfProject(claims.projectId)
  if (claims.runner?.kind === 'person') return { type: 'user', id: claims.runner.userId }
  if (claims.runner?.kind === 'project') return placeOfProject(claims.runner.projectId)
  return null
}

async function turnPlace(turn: TurnCaller['turn']): Promise<Place | null> {
  if (turn.home === 'PERSON') {
    const owner = turn.actingUserId ?? turn.readerUserId ?? null
    return owner ? { type: 'user', id: owner } : null
  }
  return turn.projectId ? placeOfProject(turn.projectId) : null
}

/** The person, if still in the organisation (adr-0101); a call for someone who has left is refused. */
async function stillHere(personId: string | null): Promise<string | null> {
  if (!personId) return null
  const row = await prisma.user.findUnique({ where: { id: personId }, select: { deactivatedAt: true } })
  if (!row || row.deactivatedAt !== null) {
    throw new ControlPlaneError('forbidden', 'The person this work is for is no longer in the organisation')
  }
  return personId
}

export async function memoryPrincipalOf(ctx: CallerContext, tool: string): Promise<MemoryPrincipal> {
  if (ctx.kind === 'connection') {
    throw new ControlPlaneError('forbidden', `${tool} is an agent's memory of its work, and a connection is no agent`)
  }
  if (ctx.kind === 'turn') {
    const place = await turnPlace(ctx.turn)
    return { personId: await stillHere(personOfTurnHome(ctx.turn.home, place, ctx.turn.actingUserId)), agentId: ctx.turn.agentId, place }
  }
  const { claims } = ctx
  if (!claims.agentId) throw new ControlPlaneError('forbidden', `${tool} needs a run acting as an agent`)
  return { personId: await stillHere(await runPerson(claims)), agentId: claims.agentId, place: await runPlace(claims) }
}

/** A turn that answers no one only reads, as everywhere else (turnCaller.ts). */
export function requireMayWrite(ctx: CallerContext, tool: string): void {
  if (ctx.kind === 'turn' && !ctx.turn.actingUserId) {
    throw new ControlPlaneError('forbidden', `${tool} changes something, and this turn acts for no one: it may only read`)
  }
}
