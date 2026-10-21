/**
 * The pinned memory a run starts with (memory and knowledge spec, Workers and helpers): resolved here under the
 * same rule as the memory tools (`principal.ts`) — the person the run is for reads their own scopes and agent ×
 * place; a run nobody commissioned, a pulse or a schedule's, reads agent × place only — and carried to the site
 * in the run's context, which writes it as a file. What a run recalls beyond these it asks for with `recall`.
 *
 * A run in a home other members' runs share — a project's task runs — is for no person here either: its files and
 * transcripts can be read by every run of that project, so nothing of one person's is put there.
 */
import { prisma } from 'wasp/server'
import { type PinnedMemoryItem, type RunStartedBy } from '@agenthix/core'
import { personalOwnerOf } from '../projects/personalProject'
import type { OverrideBoundary } from '../agents/overrides/agentOverrideService'
import type { MemoryPrincipal, Place } from './contract'
import { memoryService } from './memoryService'

async function placeOf(boundary: OverrideBoundary | null): Promise<Place | null> {
  if (!boundary) return null
  if (boundary.type === 'user') return { type: 'user', id: boundary.id }
  const owner = await personalOwnerOf(boundary.id)
  return owner ? { type: 'user', id: owner } : { type: 'project', id: boundary.id }
}

/** A person who has left the organisation is no one a run is for (adr-0101). */
async function personStillHere(personId: string | null): Promise<string | null> {
  if (!personId) return null
  const row = await prisma.user.findUnique({ where: { id: personId }, select: { deactivatedAt: true } })
  return row && row.deactivatedAt === null ? personId : null
}

export async function pinnedMemoryForRun(run: {
  agentId: string
  /** The person the run is for, as `personOfRun` names them; ignored for a pulse's or a schedule's run. */
  personId: string | null
  startedBy: RunStartedBy | null
  boundary: OverrideBoundary | null
  /** The person whose own harness home the run uses; null for a project's home, which its task runs share. */
  runnerPersonId: string | null
}): Promise<PinnedMemoryItem[]> {
  const commissioned = run.startedBy !== 'pulse' && run.startedBy !== 'schedule'
  const ownHome = run.personId !== null && run.runnerPersonId === run.personId
  const principal: MemoryPrincipal = {
    personId: commissioned && ownHome ? await personStillHere(run.personId) : null,
    agentId: run.agentId,
    place: await placeOf(run.boundary),
  }
  const items = await memoryService.pinned(principal)
  return items.map(item => ({
    key: item.key,
    scope: item.scope.toLowerCase() as PinnedMemoryItem['scope'],
    title: item.title,
    body: item.body,
  }))
}
