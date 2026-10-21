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
import type { RunContextPayload, AgentConfigPayload, CapabilityClaims, RunCredential } from '@agenthix/core'
import { normalizeTimezone, type LocationRef, type RunStartedBy } from '@agenthix/core'
import { pinnedMemoryForRun } from '../memory/runPinnedMemory'
import { fetchPrimaryOwnerSlug } from './locationResolver'
import { resolveRunCredential, type ResolvedCredential, type RunPerson } from '../model-access/modelCredential'
import { resolveFallbackCredentials } from '../model-access/fallbackCredentials'
import { getWebSearchKey } from '../server/providerService'
import { resolveRunPackages } from '../packages/runPackages'
import { toAgentConfigPayload } from './dispatchPayloads'
import { applyBoundaryOverride, type OverrideBoundary } from './overrides/agentOverrideService'
import type { GrantTarget } from '../sites/subscriptionGrants'

/** The site's name for the OpenCode runtime (site `runtime/types.ts`). */
const OPENCODE_RUNTIME = 'opencode'

/** The grant target a run's capability names: the site it goes to, its session, and who it runs for. */
export function grantTargetOf(claims: Pick<CapabilityClaims, 'siteId' | 'sessionId' | 'runner'>): GrantTarget {
  return { siteId: claims.siteId, sessionId: claims.sessionId, runner: claims.runner }
}

/** A subscription goes only to a dispatched run, which names where it goes (`grantTo`) and so is handed it granted. */
function dispatchable(credential: ResolvedCredential | null): RunCredential | null {
  if (!credential || credential.kind === 'apiKey') return credential
  return 'grantId' in credential ? credential : null
}

/**
 * Pre-resolves everything site needs beyond the capability itself: the
 * agent's config (agentUtils.ts's 11-field select + `isKernel`), SiteConfig.riskRules
 * (sdkToolGate.ts), and the one model
 * credential the run may use (modelCredential.ts). `primaryLoc` decides
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
    task?: RunContextPayload['task']
    /**
     * The person the run is on behalf of (adr-0095) — a chat's person, or
     * whoever started a task's run, else the task's person — whose timezone the
     * agent reads times in and whose own model access the run uses after its
     * project's (adr-0105). Null or absent for a run with none.
     */
    personUserId?: string | null
    /**
     * What started the run, which decides whose pinned memory it starts with: a pulse's or a schedule's run is for
     * no one and gets its place's only (`runPinnedMemory.ts`). Absent is a person's start.
     */
    startedBy?: RunStartedBy
    /**
     * The session the run executes in. The site runs a conversation on the
     * runtime it started with and the session's chosen model (runLaunch.ts),
     * and the credential must be the provider of THAT model (spec §6).
     */
    session?: Pick<AgentSession, 'runtime' | 'model'>
    /**
     * The models the turn may fall back to. Each one's provider is given its
     * credential too, so the site's model relay can serve it (spec §6). No
     * agent names a fallback model yet, so every caller sends none.
     */
    fallbackModels?: readonly string[]
    /**
     * Where the run is dispatched — its site, session and runner, from the
     * capability minted for it. A subscription handed to the run is recorded
     * as a grant to that site, so the site can report a refreshed token back
     * (subscriptionGrants.ts). Every dispatch passes it.
     */
    grantTo?: GrantTarget
  },
  precomputedPrimaryOwnerSlug?: string,
): Promise<RunContextPayload> {
  const agentConfig: AgentConfigPayload = await applyBoundaryOverride(toAgentConfigPayload(agent), boundary)

  // The same choice the site makes: a conversation keeps the runtime it began on.
  const session = extras?.session
  const runtime = session?.runtime ?? agentConfig.runtime
  const model = session?.model ?? agentConfig.defaultModel

  // The run's model access follows the person it is on behalf of (adr-0105),
  // after its project's own. Their login may go only into their own harness
  // home: the runner the capability names, or — for a caller dispatching
  // nothing — the owner of a person's own storage, the only one who runs there.
  const runnerPersonId = extras?.grantTo
    ? extras.grantTo.runner.kind === 'person' ? extras.grantTo.runner.userId : null
    : boundary?.type === 'user' ? boundary.id : null
  const runPerson: RunPerson = { personId: extras?.personUserId ?? null, runnerPersonId }
  const [primaryOwnerSlugValue, siteConfigRow, { credential, problem }, fallbackCredentials, packages, webSearchKey] = await Promise.all([
    precomputedPrimaryOwnerSlug ?? fetchPrimaryOwnerSlug(primaryLoc),
    prisma.siteConfig.findFirst({ select: { riskRules: true } }),
    resolveRunCredential(boundary, runPerson, runtime, model, extras?.grantTo),
    resolveFallbackCredentials(boundary, runPerson, runtime, model, extras?.fallbackModels ?? []),
    resolveRunPackages(agent.id),
    // Only OpenCode serves web search through the site; Claude searches on
    // Anthropic's own service, so its runs are never sent the org's Exa key.
    runtime === OPENCODE_RUNTIME ? getWebSearchKey() : null,
  ])

  const [person, pinnedMemory] = await Promise.all([
    personContext(extras?.personUserId),
    pinnedMemoryForRun({
      agentId: agent.id, personId: extras?.personUserId ?? null, startedBy: extras?.startedBy ?? null, boundary, runnerPersonId,
    }),
  ])

  const ownerSlugs: Record<string, string> =
    primaryOwnerSlugValue !== null ? { [primaryLoc.ownerId]: primaryOwnerSlugValue } : {}

  return {
    agent: agentConfig,
    chat: kind === 'chat' ? extras?.chat : undefined,
    task: kind === 'task' ? extras?.task : undefined,
    mounts: { ownerSlugs },
    // A stored JSON column, written only by `updateRiskRules` as a list of rules.
    riskRules: (siteConfigRow?.riskRules ?? null) as RunContextPayload['riskRules'],
    credential: dispatchable(credential),
    ...(credential === null && problem ? { credentialProblem: problem } : {}),
    ...(fallbackCredentials.length > 0 ? { fallbackCredentials } : {}),
    ...(webSearchKey ? { webSearchKey } : {}),
    packages,
    ...(person ? { person } : {}),
    ...(pinnedMemory.length > 0 ? { pinnedMemory } : {}),
  }
}

/** The person's timezone for the agent, or undefined when there is no person or they have set none. */
async function personContext(userId: string | null | undefined): Promise<RunContextPayload['person']> {
  if (!userId) return undefined
  const timezone = normalizeTimezone(
    (await prisma.userSettings.findUnique({ where: { userId }, select: { timezone: true } }))?.timezone,
  )
  return timezone ? { timezone } : undefined
}
