/**
 * A run's memory (ADR-0188; spec, Recall): at the run's start hq runs the same search a turn does, with the run's
 * brief as the query — the task's title and description, or the message that started it — under the run's person,
 * agent and place, and sends what it finds in the run's context; the site writes it as a read-only file. What a run
 * needs beyond it, it asks for with `recall`.
 *
 * Who a run is for follows the one rule (`principal.ts`): only a run a person or an agent working for one started,
 * in that person's own home. A pulse's or a schedule's run, and a run in a home other members' runs share — a
 * project's task runs, whose files and transcripts every run of that project can read — are for no person, and get
 * no memory.
 */
import { prisma } from 'wasp/server'
import type { RunMemory, RunStartedBy } from '@agenthix/core'
import { personalOwnerOf } from '../projects/personalProject'
import type { OverrideBoundary } from '../agents/overrides/agentOverrideService'
import { Logger } from '../server/utils/logger'
import type { MemoryPrincipal, Place } from './contract'
import { markRecalled } from './memoryRows'
import { probe as defaultProbe, type TurnProbe } from '../conversations/memory/probe'

const logger = new Logger('RunMemory')

/** The local model reads about 256 tokens; the brief's start is what matters most. */
export const RUN_QUERY_MAX_CHARS = 1_200
/** How long a run's start waits for the search; a run without its memory still has `recall`. */
export const RUN_MEMORY_TIME_LIMIT_MS = 2_000

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

export interface RunFor {
  agentId: string
  /** The person the run is for, as `personOfRun` names them; ignored for a pulse's or a schedule's run. */
  personId: string | null
  startedBy: RunStartedBy | null
  boundary: OverrideBoundary | null
  /** The person whose own harness home the run uses; null for a project's home, which its task runs share. */
  runnerPersonId: string | null
  /** What the run is about: the task's title and description, or the message that started it. */
  brief: string | null
}

export async function runPrincipal(run: RunFor): Promise<MemoryPrincipal> {
  const commissioned = run.startedBy !== 'pulse' && run.startedBy !== 'schedule'
  const ownHome = run.personId !== null && run.runnerPersonId === run.personId
  return {
    personId: commissioned && ownHome ? await personStillHere(run.personId) : null,
    agentId: run.agentId,
    place: await placeOf(run.boundary),
  }
}

export interface RunMemoryDeps {
  probe(principal: MemoryPrincipal, query: string): Promise<TurnProbe>
  markRecalled(ids: string[], now: Date): Promise<void>
  timeLimitMs: number
}

function within<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined
  const late = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error(`no answer within ${ms} ms`)), ms) })
  return Promise.race([work, late]).finally(() => clearTimeout(timer))
}

/** What memory found for the run, or null when it is for no person, has no brief, or nothing was found. Never throws. */
export async function memoryForRun(run: RunFor, deps: RunMemoryDeps = defaultDeps): Promise<RunMemory | null> {
  const query = run.brief?.replace(/\s+/g, ' ').trim().slice(0, RUN_QUERY_MAX_CHARS)
  if (!query) return null
  try {
    const principal = await runPrincipal(run)
    if (!principal.personId) return null
    const found = await within(deps.probe(principal, query), deps.timeLimitMs)
    if (found.certain.length + found.probable.length === 0) return null
    await deps.markRecalled(found.certain.map(i => i.itemId), new Date())
    return {
      items: found.certain.map(i => ({ key: i.key, kind: i.kind.toLowerCase(), title: i.title, body: i.body })),
      hinted: found.probable.map(p => ({ key: p.key, title: p.title })),
    }
  } catch (err) {
    logger.warn(`The memory search for a run failed; the run starts without it: ${err instanceof Error ? err.message : String(err)}`)
    return null
  }
}

const defaultDeps: RunMemoryDeps = { probe: defaultProbe, markRecalled, timeLimitMs: RUN_MEMORY_TIME_LIMIT_MS }
