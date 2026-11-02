/**
 * Agent Service
 * =============
 * Pure business logic for agent CRUD. No auth, no HTTP — called by Wasp
 * actions (which add auth) and MCP tool handlers (which add response formatting).
 */
import { prisma, HttpError } from 'wasp/server'
import { deriveSlug } from '../shared/identifiers'
import { AGENT_HANDLE_MAX_LENGTH, INVALID_AGENT_HANDLE_MESSAGE, isValidAgentHandle } from './agentHandle'
import { triggerSnapshotPush } from '../server/dashboard/debouncedPush'
import { recordActivity } from '../server/dashboard/activity'
import { sitesForSessions, SESSION_SITE_SELECT } from './agentSite'
import * as siteRuntimeStore from '../sessions/siteRuntimeStore'
import { initialAgentContent } from '../packages/agentAssets'
import {
  writeAgentContent, settingsColumns, defaultAgentSettings, type AgentContent, type AgentSettings,
} from '../packages/agentPackageService'
import { deletePackage } from '../packages/packageStore'
import { Logger } from '../server/utils/logger'

const logger = new Logger('Agents')

export function generateHandle(name: string): string {
  const suffix = Math.random().toString(36).substring(2, 6)
  // Room for "-" and the suffix inside the handle's length limit.
  const base = deriveSlug(name).slice(0, AGENT_HANDLE_MAX_LENGTH - 5).replace(/-+$/, '')
  return `${base}-${suffix}`
}

export interface CreateAgentParams {
  name: string
  /** Auto-generated from name if omitted */
  handle?: string
  /** Structured identity fields — used by MCP create_agent */
  role?: string
  responsibilities?: string
  /** Content beyond the blank template — templates and imports. */
  initialContent?: Partial<AgentContent>
  /** The agent's settings, from a template or an archive. Omitted: the defaults. */
  settings?: AgentSettings
  /** Who wrote the first content; null for a system caller. */
  createdById?: string | null
  /** Made from a template (adr-0157): the version it was made from, kept read-only, and the skills it carries, granted. */
  madeFrom?: { versionId: string; skillAssetIds: string[] }
}

/** Identity. */
export interface UpdateAgentParams {
  id: string
  name?: string
  handle?: string
  role?: string
}

export async function listAgents() {
  return prisma.agent.findMany({ orderBy: { createdAt: 'desc' } })
}

export async function createAgent(params: CreateAgentParams) {
  const handle = params.handle ?? generateHandle(params.name)
  // Every way an agent is created lands here, and the handle names the agent's
  // credential home on a site's disk, so it is checked once, here (spec §4.27).
  if (!isValidAgentHandle(handle)) throw new HttpError(400, INVALID_AGENT_HANDLE_MESSAGE)

  const existing = await prisma.agent.findUnique({ where: { handle } })
  if (existing) throw new Error(`Agent with handle '${handle}' already exists`)

  // Validated before anything touches disk: an invalid setting (e.g. a bad
  // approval) must leave no provisioned workspace behind.
  const settings = settingsColumns(params.settings ?? defaultAgentSettings())
  const content = await initialAgentContent(params)

  const agent = await prisma.$transaction(async tx => {
    const created = await tx.agent.create({
      data: {
        name: params.name,
        handle,
        role: params.role,
        madeFromVersionId: params.madeFrom?.versionId ?? null,
        ...settings,
      },
    })
    if (params.madeFrom?.skillAssetIds.length) {
      await tx.assetGrant.createMany({
        data: params.madeFrom.skillAssetIds.map(assetId => ({ assetId, agentId: created.id, grantedById: params.createdById ?? null })),
        skipDuplicates: true,
      })
    }
    await writeAgentContent(created.id, content, params.createdById ?? null, tx)
    return created
  })
  recordActivity('agent_added', `@${agent.handle} added`, agent.id)
  triggerSnapshotPush()
  return agent
}

export async function updateAgent(params: UpdateAgentParams) {
  const { id, ...data } = params

  // A rename changes the row and nothing else. The agent's credential home on a
  // site's disk is named by the handle, but it is the site's to place: the site
  // resolves it from the current handle at container start and re-seeds it when
  // it is absent, so the directory under the old handle is simply left behind
  // rather than moved out from under the containers still bound to it.
  // A new handle is still checked before the row changes — it has to name one
  // directory on whichever site next runs the agent — and a collision answers a
  // clean 409 rather than a raw Prisma unique-constraint 500 (F-024).
  if (data.handle !== undefined) {
    const current = await prisma.agent.findUnique({ where: { id }, select: { handle: true } })
    if (current && current.handle !== data.handle) {
      // An empty handle counts as invalid too: it would name agents/ itself
      // (spec §4.27).
      if (!isValidAgentHandle(data.handle)) throw new HttpError(400, INVALID_AGENT_HANDLE_MESSAGE)
      const clash = await prisma.agent.findFirst({ where: { handle: data.handle, id: { not: id } }, select: { id: true } })
      if (clash) throw new HttpError(409, `An agent with handle '${data.handle}' already exists`)
    }
  }

  const agent = await prisma.agent.update({ where: { id }, data: data as any })
  triggerSnapshotPush()
  return agent
}

export async function deleteAgent(agentId: string) {
  const agent = await prisma.agent.findUnique({ where: { id: agentId } })
  if (!agent) return

  // Cascade: site-held runs/transcripts/tool calls → AgentSession → Agent.
  // SITE-FIRST (same ordering as sessions/actions.ts's deleteTaskSession,
  // SC-346): a site failure aborts here, before hq's own AgentSession copy
  // disappears. hq holds no run, transcript or tool-call rows of its own.
  //
  // Every site the agent has a session on is swept, resolved from the session
  // rows themselves: a run's site follows the storage it works in, so an
  // agent working across two machines has runs and transcripts on both, and
  // addressing only one would leave the other's orphaned with the hq copy
  // that named them gone.
  const sessions = await prisma.agentSession.findMany({
    where: { agentId },
    select: { id: true, ...SESSION_SITE_SELECT },
  })
  const { siteIds, unresolved } = await sitesForSessions(sessions)
  if (unresolved > 0) {
    logger.warn(`${unresolved} of agent ${agentId}'s session(s) name no Execution Site — nothing to sweep for them`)
  }
  if (sessions.length > 0) {
    for (const siteId of siteIds) {
      await siteRuntimeStore.deleteSessionsBy(siteId, { agentId })
    }
    await prisma.agentSession.deleteMany({ where: { id: { in: sessions.map(s => s.id) } } })
  }

  // An agent's content is its package, and the package table carries no
  // foreign key back to it, so nothing in the database removes it with the row.
  // It is found by kind and key and removed explicitly, in the same
  // transaction as the row, so a failure leaves neither half done. What the row
  // does own by relation (memory items, overrides, project assignments)
  // cascades from the delete below.
  await prisma.$transaction(async tx => {
    await deletePackage('agent', agentId, tx)
    await tx.agent.delete({ where: { id: agentId } })
  })

  // Stop any of the agent's live containers — site-side now (plan 5d-2 task
  // 10), same `agent.stop` call actions.ts's own stopAgent action uses. A
  // run's container is normally torn down when the run ends, so this is a
  // safety net; best-effort like the old in-process stopAgent's own
  // catch-everything behaviour, so an unreachable site never blocks a delete
  // that has already succeeded above. Same site set as the sweep above — a
  // container only exists where a run put it.
  //
  // Then the agent's own directory there — its Claude credential home, the one
  // thing left under agents/<handle>/. hq removes nothing from a site's disk
  // itself: it asks, and the site derives the path from its own root. Ordered
  // after that site's stop and skipped when the stop failed, so the directory
  // never goes out from under a container still bound to it.
  //
  // Best-effort in the same way, and for the same reason: the database half has
  // already committed above, so an unreachable site must not fail a delete that
  // has happened. The cost of a failure is a credential home left on that site
  // with no agent row naming it — the state every delete used to leave — so it
  // is worth retrying by hand rather than worth aborting for.
  for (const siteId of siteIds) {
    await siteRuntimeStore.stopAgent(siteId, agent.handle)
      .then(() => siteRuntimeStore.removeAgentDirectory(siteId, agent.handle))
      .catch(() => {})
  }
}
