/**
 * Which sites an agent's work is on.
 *
 * A run is placed by the storage it works in, and an agent's sessions can work
 * in storage on more than one machine — so "the agent's runs" is a SET of
 * sites, never one. An agent has no anchor of its own to address a run by —
 * placement follows the storage the run works in, and nothing else.
 *
 * This is not a general design for reading across sites — that is a larger
 * question. It is the narrow thing that keeps agent-scoped reads and
 * agent-scoped stops agreeing with where dispatch actually put the work, over
 * the sessions the caller already has in hand.
 */
import { HttpError, prisma } from 'wasp/server'
import type { SessionLocationFields } from '../storage/primaryLocationService'
import { Logger } from '../server/utils/logger'
import { requireDefaultSiteId } from '../sites/localSite'
import { resolveSiteIdForSession } from './dispatchSiteResolution'

const logger = new Logger('AgentSites')

/** What a session row must select for its site to be resolvable. */
export const SESSION_SITE_SELECT = {
  primaryOwnerType: true,
  primaryOwnerId: true,
  primaryWorkspaceId: true,
  taskId: true,
  userId: true,
  sessionType: true,
} as const

type LocatableSession = SessionLocationFields & { id: string }

export interface AgentSites {
  /** The sites that resolved, in first-seen order. */
  siteIds: string[]
  /** How many sessions named no site at all and were passed over. */
  unresolved: number
}

/**
 * The distinct sites a set of already-loaded session rows resolves to.
 *
 * Two failures live here and they are not the same thing. A session whose
 * location cannot be resolved AT ALL — an unplaced workspace, a project naming
 * no site — has no site to ask, and whatever runtime rows it has are orphaned
 * already by that fact alone. It is passed over with a warning and counted, so
 * one bad session cannot make an agent unreadable or, worse, undeletable: an
 * agent that cannot be deleted is a trap with no way out, which costs more than
 * the rows it would have swept.
 *
 * A site that merely cannot be REACHED is a different answer and is not handled
 * here at all: resolution reads hq's own tables, so it still names the site, and
 * the call that then fails to reach it raises where it is made. That is what
 * keeps a delete site-first — it aborts before hq's copy goes.
 *
 * Anything else — a dropped connection during resolution — is neither, and
 * still raises.
 */
export async function sitesForSessions(sessions: LocatableSession[]): Promise<AgentSites> {
  const siteIds = new Set<string>()
  let unresolved = 0
  for (const session of sessions) {
    try {
      siteIds.add(await resolveSiteIdForSession(session))
    } catch (err) {
      if (!(err instanceof HttpError)) throw err
      unresolved++
      logger.warn(`session ${session.id} names no Execution Site (${err.message}) — passed over`)
    }
  }
  return { siteIds: [...siteIds], unresolved }
}

/** The same, for callers that do not already hold the agent's sessions. */
export async function sitesForAgent(agentId: string): Promise<AgentSites> {
  const sessions = await prisma.agentSession.findMany({
    where: { agentId },
    select: { id: true, ...SESSION_SITE_SELECT },
  })
  return sitesForSessions(sessions)
}

/**
 * Where a question about the agent ITSELF is asked — one that reads no run and
 * touches no storage, so every site capable of running the agent answers it
 * identically. Building a prompt preview is the only such question. Anything
 * that names a run belongs above, not here.
 */
export async function resolveAgentSiteId(): Promise<string> {
  return requireDefaultSiteId()
}
