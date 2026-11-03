/**
 * Resolves §2a capability claims at mint time. hq pre-computes the effective
 * permissions here so the site runtime never combines them itself. Reused by
 * both the run-start mint and the renewal endpoint — renewal re-resolves fresh,
 * which is how a settings change reaches an already-running session within one
 * TTL.
 */
import { prisma } from 'wasp/server'
import { sameRunner, type CapabilityClaims, type CapabilityPersonalProject, type RunStartedBy } from '@agenthix/core'
import { resolvePrimaryLocation, type SessionLocationFields } from '../../storage/primaryLocationService'
import type { LocationRef } from '@agenthix/core'
import { resolveStorageSite } from '../../storage/storageSite'
import * as store from '../../storage/workspaceStore'
import { runBoundary, runPermissions, type OverrideBoundary } from '../../agents/overrides/agentOverrideService'
import { isSpaceProject, taskRunOwner } from '../../projects/personalProject'
import { resolveRunner } from './capabilityRunner'
import { runSiteAndClaim } from '../../livePreviews/runs'
import { orgTrustedPackageScopes } from '../../livePreviews/packageScopes'
import { runFeatures } from '../../features/runFeatures'

export interface CapabilityAgentFields {
  id: string
  allowedTools: unknown
  allowedBashPatterns: unknown
  approval?: string | null
}

// A run executes on the site holding the storage the run is FOR — its primary
// location, whatever kind of owner that is. `resolveStorageSite` answers that
// for all three kinds and refuses rather than guessing when it cannot; nothing
// about the agent enters into it, and there is no fallback chain behind it.
//
// Exported because dispatchSiteResolution.ts's resolveSiteIdForTask/
// resolveSiteIdForSession reach a run's site WITHOUT re-minting a capability
// (manifest approval, cancel, task-machine ownership checks) — one resolver,
// not a second copy that could drift from dispatch's own choice.
export function resolveExecutionSiteId(loc: LocationRef): Promise<string> {
  return resolveStorageSite(loc)
}

export async function resolveCapabilityClaims(args: {
  agent: CapabilityAgentFields
  session: SessionLocationFields & { id: string }
  /** Where the run works. The caller resolves it, because it is also what the run's cwd and mounts are built from. */
  primaryLoc: LocationRef
  taskId: string | null
  /** What started the run, signed into the claims so a tool call can read it (adr-0087). */
  startedBy: RunStartedBy
  /**
   * The person a person-started run in a task is for (the message's sender, or
   * the task run's starter). Signed so the control plane can follow adr-0089's
   * chain from a tool call. Says who the work is for; grants nothing.
   */
  onBehalfOfUserId?: string | null
  /** For a renewal: the site the run is on, which a renewal never moves (`livePreviews/runs.ts`). */
  runSiteId?: string | null
}): Promise<CapabilityClaims> {
  const { agent, session, primaryLoc, taskId, startedBy, onBehalfOfUserId } = args
  const workspaceId = primaryLoc.workspaceId ?? null
  // ADR-0060: a run acts with the authority of the ONE boundary it is for. The
  // boundary decides both claims below — the project it is confined to, and
  // whether there is a person whose role it may carry at all.
  const boundary = await runBoundary(session)
  // Before the runner and the site are resolved: a location that should not
  // exist is refused as what it is, not as whatever its lookup fails with.
  await requireNoPersonalProjectStorage(session, primaryLoc, boundary)
  const personalProject = await personalProjectOf(primaryLoc)
  const runner = resolveRunner(
    session,
    { ownerType: primaryLoc.ownerType, ownerId: primaryLoc.ownerId, ...(personalProject ? { personalOwnerId: personalProject.personalOwnerId } : {}) },
    boundary,
  )
  // A branch whose live preview runs on another site has its runs there, in the live preview's own copy; and a run
  // on a branch with a live preview on its own site carries the claim its app tools are answered by.
  const { siteId, livePreview: previewClaim } = await runSiteAndClaim(session.id, await resolveExecutionSiteId(primaryLoc), args.runSiteId ?? null)

  // The project this run acts as: a task's current project, or the project a
  // chat is working in. Null for a run that acts as a person.
  // Derived from the boundary rather than from `taskId`, which is why a chat
  // inside a project is now scoped to it instead of passing on a role.
  //
  // A task in a personal project is the one run that acts as a person and still
  // names a project: its own personal project, so the task tools can reach the
  // task they are running — and nothing else, since the control plane confines
  // a role-less run to this id (authorize.ts). It carries no role, no project
  // runner and no project storage.
  const projectId = boundary?.type === 'project' ? boundary.id : await personalTaskProject(session, boundary)
  // A chat in one of a deleted project's workspaces still resolves a site
  // through the workspace's surviving placement, so nothing above refuses it;
  // without this its renewal would keep acting for the project indefinitely.
  if (projectId !== null) await requireProjectExists(projectId)

  // What the run may attempt: the agent's own permissions with the boundary's narrowing on top, the strictest level
  // winning for each tool, bash pattern and approval (permissions/effectivePermissions.ts). A bypassed run has every
  // tool at Always, platform tools included: no list the organisation saved applies, and what it may do in Agenthix
  // is the authority of the person it is for, which the control plane checks at each call (authorize.ts, adr-0101).
  // §H6, as a guardrail (ADR-0079): those tools are then narrowed by the allowed list of the ONE
  // workspace the run works in, if it has one. A run working in the project's
  // files, a task folder or personal storage takes no workspace's list — the
  // container mounts the whole boundary, and a workspace's settings guard only
  // the runs working in it. null means no list (no cap); [] is an explicit "no
  // tools". neverTools derives AFTER the narrowing, which is what carries a
  // workspace's list through even when approval is bypassed — and, since a
  // bypassed run lists every tool, a write tool the list leaves out always reaches it (SC-352).
  const effective = await runPermissions(agent, boundary)
  const bypassed = effective.approval === 'bypassed'
  let toolPermissions = effective.allowedTools
  if (workspaceId) {
    // Placement-addressed (store.getWorkspace): the session's workspace need
    // not live on the run's own execution site. Fails closed (SC-322): a store
    // failure propagates and the mint refuses, and a missing row refuses too —
    // the session names this workspace, so its absence means the location is
    // stale, and treating that as "no list" would hand back the agent's full,
    // unguarded toolset on the next mint.
    const ws = await store.getWorkspace(workspaceId)
    if (!ws) throw new Error(`Workspace ${workspaceId} no longer exists — the session's location is stale`)
    if (Array.isArray(ws.allowedTools)) {
      const list = ws.allowedTools as string[]
      toolPermissions = toolPermissions.map(p => list.includes(p.name) ? p : { ...p, state: 'never' as const })
    }
  }
  // A flagged feature's tools reach the run only while it is on (adr-0172), whatever the agent's permissions say.
  const features = await runFeatures()
  // The claim its app tools are answered by, only while the live preview's flag is on.
  const livePreview = features.isOn('livePreview') ? previewClaim : null
  const neverTools = [...new Set([
    ...toolPermissions.filter(p => p.state === 'never').map(p => p.name),
    ...features.withheldTools,
  ])]

  // The role marks a chat in its person's own storage (ADR-0060, spec §6.3), the
  // one kind of run that acts as its person; memory and personal git access read
  // that mark. It authorises nothing in the control plane, which reads the
  // current role of the person the run is for at every call (adr-0101).
  let role: CapabilityClaims['role'] = null
  const actsAsInvoker =
    taskId === null &&
    session.sessionType === 'chat' &&
    boundary?.type === 'user' &&
    boundary.id === session.userId
  if (actsAsInvoker) {
    const settings = await prisma.userSettings.findUnique({
      where: { userId: session.userId }, select: { role: true },
    })
    role = settings?.role ?? null
  }

  // Signed into every run, so they apply wherever it installs packages (adr-0170): in a live preview or in its
  // branch's copy. hq decides whether a run is code work after the mint, and a renewal does not know it.
  const trustedPackageScopes = await orgTrustedPackageScopes()

  return {
    tokenType: 'capability',
    userId: session.userId,
    runner,
    ...(personalProject ? { personalProject } : {}),
    startedBy,
    ...(onBehalfOfUserId ? { onBehalfOfUserId } : {}),
    agentId: agent.id,
    sessionId: session.id,
    projectId,
    workspaceId,
    taskId,
    role,
    siteId,
    ...(livePreview ? { livePreview } : {}),
    ...(trustedPackageScopes.length ? { trustedPackageScopes } : {}),
    permissions: {
      bypassed,
      allowedTools: bypassed ? [] : toolPermissions,
      allowedBashPatterns: effective.allowedBashPatterns,
      neverTools,
    },
  }
}

/**
 * Your space has no storage of its own (spec §4), so no run may work in it as a `project` location — that would
 * mount it and run as a project. And a task run's location must be the one its task is for: the person's own
 * storage for a task in their space, the project's own for any other task, a personal project included. Checked
 * at every mint and renewal, so a session row that disagrees is refused rather than signed.
 */
async function requireNoPersonalProjectStorage(
  session: SessionLocationFields & { id: string },
  primaryLoc: LocationRef,
  boundary: OverrideBoundary | null,
): Promise<void> {
  if (primaryLoc.ownerType === 'project' && (await isSpaceProject(primaryLoc.ownerId))) {
    throw new Error(`Session ${session.id} works in Your space's storage, which does not exist`)
  }
  if (!session.taskId || !boundary) return
  const owner = await taskRunOwner(session.taskId)
  if (!owner || primaryLoc.ownerType !== owner.storage.ownerType || primaryLoc.ownerId !== owner.storage.ownerId) {
    throw new Error(`Session ${session.id}'s location does not match its task's storage`)
  }
}

/**
 * The personal project whose own storage the run works in, and its person, or null for a person's own storage and
 * a shared project. Signed into the claim, it is what lets a task there run as its person, at hq and at the site.
 */
async function personalProjectOf(primaryLoc: LocationRef): Promise<CapabilityPersonalProject | null> {
  if (primaryLoc.ownerType !== 'project') return null
  const project = await prisma.project.findUnique({
    where: { id: primaryLoc.ownerId }, select: { personalOwnerId: true, personalSpace: true },
  })
  if (!project?.personalOwnerId || project.personalSpace) return null
  return { projectId: primaryLoc.ownerId, personalOwnerId: project.personalOwnerId }
}

/** The personal project a task run in a person's boundary belongs to — only ever that person's own (any of them). */
async function personalTaskProject(
  session: SessionLocationFields & { id: string },
  boundary: OverrideBoundary | null,
): Promise<string | null> {
  if (!session.taskId || boundary?.type !== 'user') return null
  const owner = await taskRunOwner(session.taskId)
  if (!owner || owner.ownerType !== 'user' || owner.ownerId !== boundary.id) {
    throw new Error(`Session ${session.id}'s task is not in ${boundary.id}'s personal project`)
  }
  return owner.projectId
}

async function requireProjectExists(projectId: string): Promise<void> {
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true } })
  if (!project) throw new Error(`Project ${projectId} no longer exists`)
}

/**
 * Renewal (§2a): re-resolve from live rows and sign fresh. Throws if the
 * session/agent is gone. Returns the resolved `claims` alongside the signed
 * token — not just for callers that want them (none do yet), but because the
 * HTTP handler MUST compare `claims.siteId` against the site it authenticated
 * as before handing the token back: siteId is re-resolved live here, so it
 * picks up a placement or settings change made since the original mint (the
 * whole point of renewal re-resolving rather than just re-signing) — and if
 * that re-resolution ever disagreed with the presenting caller's own site,
 * returning claims lets the handler catch that drift instead of minting a
 * capability audienced to a site other than the one that asked for it.
 */
export async function renewCapability(
  current: Pick<CapabilityClaims, 'sessionId' | 'agentId' | 'taskId' | 'runner' | 'startedBy' | 'onBehalfOfUserId'> & { siteId?: string },
) {
  const [agent, session] = await Promise.all([
    prisma.agent.findUnique({
      where: { id: current.agentId },
      select: { id: true, allowedTools: true, allowedBashPatterns: true, approval: true },
    }),
    prisma.agentSession.findUnique({ where: { id: current.sessionId } }),
  ])
  if (!agent || !session) throw new Error('Session or agent no longer exists')
  // The session row is the only account of where the run works that outlives
  // the dispatch call, so renewal re-derives the location from it — which is
  // what lets a placement change reach a run already under way.
  const claims = await resolveCapabilityClaims({
    agent, session, primaryLoc: resolvePrimaryLocation(session), taskId: current.taskId,
    // What started a run never changes over its life, so a renewal carries it.
    startedBy: current.startedBy,
    // Nor who it is for: carried as minted, never added by a renewal.
    onBehalfOfUserId: current.onBehalfOfUserId,
    runSiteId: current.siteId ?? null,
  })
  // The runner is carried unchanged: a renewal never moves a run to another
  // person's or project's home. It re-derives from fields that do not change,
  // so a difference means the session row was altered under a live run.
  if (!sameRunner(claims.runner, current.runner)) {
    throw new Error(`Session ${current.sessionId}'s runner no longer matches the capability being renewed`)
  }
  const { signCapability } = await import('./tokenService')
  const signed = await signCapability(claims)
  return { ...signed, claims }
}
