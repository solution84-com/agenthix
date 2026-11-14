/**
 * The dispatch context hq pre-resolves for a run — everything site needs beyond
 * the capability itself. Split out of dispatchService.ts at the repository's
 * 500-line limit, byte-preserving: the function below is the one that lived
 * there, unchanged.
 *
 * It is also what breaks the import cycle dispatchSiteResolution.ts's own doc
 * comment accepted — that module needed `buildContext` and could only reach it
 * through dispatchService.ts, which re-exports dispatchSiteResolution.ts back.
 * Both now import this module instead, and nothing imports the other.
 */
import { prisma } from 'wasp/server'
import type { Agent, AgentSession } from '@prisma/client'
import type { RunContextPayload, AgentConfigPayload, CapabilityClaims } from '@agenthix/core'
import { normalizeTimezone, type LocationRef, type RunStartedBy } from '@agenthix/core'
import { memoryForRun, pinnedForOlderSite } from '../memory/runMemory'
import { fetchPrimaryOwnerSlug } from './locationResolver'
import { runModelAccess } from '../routing/reaching'
import { chooseBoundaryRun, type RunChoice } from './runModel'
import { getWebSearchKey } from '../server/providerService'
import { resolveRunPackages } from '../packages/runPackages'
import { toAgentConfigPayload } from './dispatchPayloads'
import { applyBoundaryOverride, type OverrideBoundary } from './overrides/agentOverrideService'
import type { GrantTarget } from '../sites/subscriptionGrants'
import { resolveRunSkills, siteTakesRunSkills, type RunSkills } from '../assets/delivery/runSkills'

/** The site's name for the OpenCode runtime (site `runtime/types.ts`). */
const OPENCODE_RUNTIME = 'opencode'

/** The grant target a run's capability names: the site it goes to, its session, and who it runs for. */
export function grantTargetOf(claims: Pick<CapabilityClaims, 'siteId' | 'sessionId' | 'runner'>): GrantTarget {
  return { siteId: claims.siteId, sessionId: claims.sessionId, runner: claims.runner }
}

const NOT_GIVEN = "The run's model provider cannot be given to this run. An organisation admin can check it under Manage organisation › AI, under Your providers."

/**
 * Pre-resolves everything site needs beyond the capability itself: the
 * agent's config (agentUtils.ts's 11-field select + `isKernel`), SiteConfig.riskRules
 * (sdkToolGate.ts), and the one model
 * model it runs on, with its provider (runModel.ts, routing/reaching.ts). `primaryLoc` decides
 * the one owner slug `mounts.ownerSlugs` carries — a run reaches that owner's
 * storage and no other, so the agent's project memberships are not consulted
 * at all.
 *
 * Exported (not module-private) so dispatchService.test.ts can assert its
 * output directly per kind, rather than only through the dispatch* wrappers.
 *
 * `precomputedPrimaryOwnerSlug`, when given, is used verbatim instead of
 * calling `fetchPrimaryOwnerSlug` again — `dispatchTaskRun` already resolves
 * the project's slug for `context.task.projectSlug`, and
 * that value IS the primary owner's slug for a task run (both derive from the
 * same `ownerSlug('project', task.projectId, task.project.slug)`), so asking
 * the database for it a second time here would be pure duplication.
 *
 * `boundary` is the caller's own already-resolved `runBoundary(session)`
 * (agentOverrideService.ts) — NOT re-derived here from `kind`/`primaryLoc`.
 * so the mint (capabilityService.ts) and the dispatch payload cannot disagree
 * about a run's boundary. Every caller computes `runBoundary` once against the
 * same session capabilityService.ts mints against, and hands the identical
 * result in here.
 */
export async function buildContext(
  agent: Agent,
  kind: 'chat' | 'task',
  primaryLoc: LocationRef,
  boundary: OverrideBoundary | null,
  extras?: {
    chat?: { sessionContext: string | null }
    /** The message that started a chat run: its memory is searched with it (`runMemory.ts`). A task run's is its task. */
    brief?: string | null
    task?: RunContextPayload['task']
    /**
     * The person the run is on behalf of (adr-0095) — a chat's person, or
     * whoever started a task's run, else the task's person — whose timezone the
     * agent reads times in and whose list of models applies. Null or absent for a run with none.
     */
    personUserId?: string | null
    /**
     * What started the run, which decides whose memory it starts with: a pulse's or a schedule's run is for no one
     * and gets none (`runMemory.ts`). Absent is a person's start.
     */
    startedBy?: RunStartedBy
    /**
     * The model the run takes (runModel.ts), when the caller has resolved it already; resolved here for the run's
     * boundary and person otherwise.
     */
    choice?: RunChoice
    /**
     * Where the run is dispatched — its site, session and runner, from the
     * capability minted for it. A subscription handed to the run is recorded
     * as a grant to that site, so the site can report a refreshed token back
     * (subscriptionGrants.ts). Every dispatch passes it.
     */
    grantTo?: GrantTarget
    /**
     * A turn of the on-behalf-of person's own conversation — their chat, or a worker their own conversation briefed
     * on their behalf, never a task's — which alone takes the person's own skills (skills spec part 4).
     */
    ownConversation?: boolean
  },
  precomputedPrimaryOwnerSlug?: string,
): Promise<RunContextPayload> {
  const agentConfig: AgentConfigPayload = await applyBoundaryOverride(toAgentConfigPayload(agent), boundary)

  const choice = extras?.choice ?? await chooseBoundaryRun(boundary, agent.id, extras?.personUserId ?? null)
  // The runtime and model follow the resolved model and its provider (models from one place, part 4).
  agentConfig.runtime = choice.runtime
  agentConfig.defaultModel = choice.model
  const runtime = choice.runtime

  // A person's own login goes only into their own harness home: the runner the capability names.
  const runnerPersonId = extras?.grantTo
    ? extras.grantTo.runner.kind === 'person' ? extras.grantTo.runner.userId : null
    : boundary?.type === 'user' ? boundary.id : null
  const [primaryOwnerSlugValue, siteConfigRow, modelAccess, packages, webSearchKey] = await Promise.all([
    precomputedPrimaryOwnerSlug ?? fetchPrimaryOwnerSlug(primaryLoc),
    prisma.siteConfig.findFirst({ select: { riskRules: true } }),
    choice.resolution ? runModelAccess(choice.resolution, [], extras?.grantTo) : null,
    resolveRunPackages(agent.id),
    // Only OpenCode serves web search through the site; Claude searches on
    // Anthropic's own service, so its runs are never sent the org's Exa key.
    runtime === OPENCODE_RUNTIME ? getWebSearchKey() : null,
  ])
  const problem = choice.problem ?? (modelAccess ? null : NOT_GIVEN)

  const brief = kind === 'task' && extras?.task ? `${extras.task.title}\n${extras.task.description}` : extras?.brief ?? null
  const [person, memory, skills] = await Promise.all([
    personContext(extras?.personUserId),
    memoryForRun({
      agentId: agent.id, personId: extras?.personUserId ?? null, startedBy: extras?.startedBy ?? null, boundary, runnerPersonId, brief,
    }),
    runSkills(agent.id, kind, primaryLoc, extras),
  ])

  // A site before 1.19 reads only the deprecated field.
  const pinnedMemory = pinnedForOlderSite(extras?.grantTo?.siteId, memory)

  const ownerSlugs: Record<string, string> =
    primaryOwnerSlugValue !== null ? { [primaryLoc.ownerId]: primaryOwnerSlugValue } : {}

  return {
    agent: agentConfig,
    chat: kind === 'chat' ? extras?.chat : undefined,
    task: kind === 'task' ? extras?.task : undefined,
    mounts: { ownerSlugs },
    // A stored JSON column, written only by `updateRiskRules` as a list of rules.
    riskRules: (siteConfigRow?.riskRules ?? null) as RunContextPayload['riskRules'],
    // The deprecated credential is no longer sent: the site reaches the run's provider through `modelAccess`.
    credential: null,
    ...(modelAccess ? { modelAccess } : {}),
    ...(problem ? { credentialProblem: problem } : {}),
    ...(webSearchKey ? { webSearchKey } : {}),
    packages,
    ...(person ? { person } : {}),
    ...(memory ? { memory } : {}),
    ...(pinnedMemory ? { pinnedMemory } : {}),
    ...(skills ? { installedSkills: skills.installedSkills, fileSkills: skills.fileSkills, personSkills: skills.personSkills } : {}),
  }
}

/**
 * The run's skills, resolved where the run is dispatched (skills spec part 5, *Delivery per turn*). Null when the
 * dispatch names no site or the site speaks a protocol without them; it then stages as before.
 */
async function runSkills(
  agentId: string,
  kind: 'chat' | 'task',
  primaryLoc: LocationRef,
  extras: { personUserId?: string | null; startedBy?: RunStartedBy; grantTo?: GrantTarget; ownConversation?: boolean } | undefined,
): Promise<RunSkills | null> {
  const siteId = extras?.grantTo?.siteId
  if (!siteId || !siteTakesRunSkills(siteId)) return null
  return resolveRunSkills({
    agentId,
    siteId,
    kind,
    startedBy: extras?.startedBy ?? 'agent',
    personId: extras?.personUserId ?? null,
    ownConversation: kind === 'chat' && extras?.ownConversation === true,
    place: { placeType: primaryLoc.ownerType, placeId: primaryLoc.ownerId },
    workspaceIds: primaryLoc.workspaceId ? [primaryLoc.workspaceId] : [],
  })
}

/** The person's timezone for the agent, or undefined when there is no person or they have set none. */
async function personContext(userId: string | null | undefined): Promise<RunContextPayload['person']> {
  if (!userId) return undefined
  const timezone = normalizeTimezone(
    (await prisma.userSettings.findUnique({ where: { userId }, select: { timezone: true } }))?.timezone,
  )
  return timezone ? { timezone } : undefined
}
