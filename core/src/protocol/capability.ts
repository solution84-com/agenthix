/**
 * HQ-issued token contracts (hq/site split spec §2, §2a, §2b).
 * hq signs these as JWTs (RS256, key served at HQ_JWKS_PATH); site verifies
 * locally. TTLs are the ADR-0040 decision. Pure types — the jose implementation
 * lives per-app (hq signs, site verifies).
 */

import type { RunStartedBy } from './runtimeData.js'
import type { JsonValue } from '../client/json.js'
import { readPackageScopes } from '../livePreview/installScripts.js'

export const IDENTITY_TOKEN_TTL_SECONDS = 60 * 60      // 1 hour  (ADR-0040)
export const CAPABILITY_TTL_SECONDS = 15 * 60          // 15 min  (ADR-0040)
export const CAPABILITY_RENEWAL_FRACTION = 0.8         // renew at 80% of TTL (spec §2a)
export const HQ_TOKEN_ISSUER = 'agenthix-hq'
export const HQ_JWKS_PATH = '/.well-known/jwks.json'
/** hq's control-plane data endpoint (spec §7.2) — a run acts through this,
 *  presenting a capability minted here as X-Run-Capability. */
export const HQ_DATA_PATH = '/api/v1/data'
/**
 * Sent with a data call, as `1`, while the run it acts for has asked for something that waits for a person's
 * approval (since site protocol 1.16): hq then refuses a change of that run's own task's state, column or type.
 * Absent: the run has asked for nothing, or the site is older.
 */
export const RUN_WAITING_APPROVAL_HEADER = 'X-Run-Waiting-Approval'
/** hq's capability renewal endpoint (§2a) — a site presents its machine
 *  credential (Authorization + X-Site-Id) plus the still-valid capability
 *  (in the body, see CapabilityRenewRequest) and receives a fresh one. */
export const HQ_CAPABILITY_RENEW_PATH = '/api/v1/capabilities/renew'

/** Three-state permission model (moved here from hq's runtime — shared with site once the execution-runtime extraction lands). */
export type ToolPermissionState = 'always' | 'ask' | 'never'

export interface ToolPermission {
  name: string
  state: ToolPermissionState
  [key: string]: string  // index signature — JSON-serializable (SuperJSONObject compat)
}

export interface BashPatternPermission {
  pattern: string
  state: ToolPermissionState
  [key: string]: string  // index signature — JSON-serializable (SuperJSONObject compat)
}

/** Identity token payload (§2). Standard JWT claims (iss/sub/iat/exp) ride alongside. */
export interface IdentityTokenClaims {
  tokenType: 'identity'
  role: 'ADMIN' | 'MEMBER'
  orgId: string | null
}

/**
 * When a person is asked about a tool set to Ask, for every run of an agent:
 * - `deferred`: the run carries on, and lists every Ask for a person to approve at the end;
 * - `immediate`: the run stops at the first Ask and asks a person at once;
 * - `bypassed`: every tool runs, tools set to Never included, and no one is asked.
 * Listed from the loosest to the strictest.
 */
export const APPROVALS = ['bypassed', 'deferred', 'immediate'] as const
export type Approval = typeof APPROVALS[number]

export function isApproval(value: unknown): value is Approval {
  return typeof value === 'string' && (APPROVALS as readonly string[]).includes(value)
}

/** Effective permissions, pre-resolved by hq at mint time (§2a) — site never combines these itself. */
export interface CapabilityEffectivePermissions {
  bypassed: boolean                           // the run's effective approval is 'bypassed'
  allowedTools: ToolPermission[]              // every level's, strictest winning; [] when bypassed
  allowedBashPatterns: BashPatternPermission[]
  neverTools: string[]                        // enforced even when approval is bypassed
}

/** Wire body for POST HQ_CAPABILITY_RENEW_PATH — the capability JWT to renew. */
export interface CapabilityRenewRequest {
  capability: string
}

/** hq's answer to a renewal: the fresh capability and when it expires, in epoch milliseconds. */
export type CapabilityRenewResult = { capability: string; expiresAt: number }

/**
 * A site's request of hq's data API (`HQ_DATA_PATH`), made for a run with its capability: one of the run's tools,
 * named by `operation`. `args` is the tool's input and the answer's `result` its output, so both are JSON by design;
 * hq validates `args` against the operation's own schema. A refusal answers `{ error }` with an HTTP error status.
 */
export type HqDataRequest = { operation: string; args: JsonValue }
export type HqDataResponse = { result: JsonValue } | { error: string }

/**
 * Who a run is for (person-scoped execution spec §1): the person whose
 * conversation it is, or the project itself for a run with nobody behind it (a
 * task).
 *
 * It records who is running and grants nothing: authority stays with the
 * storage boundary the run is for (ADR-0060). What it decides is whose private
 * harness state sits beside the run, so it comes from hq's signed capability
 * and never from the unsigned dispatch payload.
 */
export type CapabilityRunner =
  | { kind: 'person'; userId: string }
  | { kind: 'project'; projectId: string }

/**
 * Reads a runner off a verified token's payload, or null when it is absent or
 * malformed. The signature proves hq wrote the claim; this proves it has the
 * shape the rest of the site relies on.
 */
export function parseCapabilityRunner(value: unknown): CapabilityRunner | null {
  if (typeof value !== 'object' || value === null) return null
  const v = value as Record<string, unknown>
  const nonEmpty = (s: unknown): s is string => typeof s === 'string' && s.length > 0
  if (v.kind === 'person' && nonEmpty(v.userId)) return { kind: 'person', userId: v.userId }
  if (v.kind === 'project' && nonEmpty(v.projectId)) return { kind: 'project', projectId: v.projectId }
  return null
}

export function sameRunner(a: CapabilityRunner, b: CapabilityRunner): boolean {
  switch (a.kind) {
    case 'person': return b.kind === 'person' && b.userId === a.userId
    case 'project': return b.kind === 'project' && b.projectId === a.projectId
  }
}

/**
 * The storage a run works in: a person's own, or a project's. `personalOwnerId`
 * is set on a project's storage only when it is a person's personal project,
 * and only from what hq signed (`CapabilityClaims.personalProject`).
 */
export interface RunStorage {
  ownerType: 'project' | 'user'
  ownerId: string
  personalOwnerId?: string
}

/**
 * The personal project a run works in, and the person who owns it — signed by
 * hq so the site can tell a person's personal project from a shared one, which
 * its own copy of the session cannot.
 */
export interface CapabilityPersonalProject {
  projectId: string
  personalOwnerId: string
}

/** Reads the personal project claim off a verified token's payload, or null when it is absent or malformed. */
export function parseCapabilityPersonalProject(value: unknown): CapabilityPersonalProject | null {
  if (typeof value !== 'object' || value === null) return null
  const v = value as Record<string, unknown>
  const nonEmpty = (s: unknown): s is string => typeof s === 'string' && s.length > 0
  if (!nonEmpty(v.projectId) || !nonEmpty(v.personalOwnerId)) return null
  return { projectId: v.projectId, personalOwnerId: v.personalOwnerId }
}

/**
 * The storage, marked with its person when the claim names this very project:
 * a claim for any other project, or for a person's own storage, marks nothing.
 */
export function storageWithPersonalOwner(
  storage: { ownerType: 'project' | 'user'; ownerId: string },
  personalProject: CapabilityPersonalProject | null,
): RunStorage {
  const base: RunStorage = { ownerType: storage.ownerType, ownerId: storage.ownerId }
  if (!personalProject || storage.ownerType !== 'project' || personalProject.projectId !== storage.ownerId) return base
  return { ...base, personalOwnerId: personalProject.personalOwnerId }
}

/**
 * Whether a runner may run in a storage boundary — one rule, applied by hq
 * before it signs and by the site before it launches. Returns why not, or null
 * when it may.
 *
 * - Every run has a storage boundary.
 * - A person's own storage has one possible runner: that person.
 * - A chat is always its invoking person's (`invokerUserId`, the capability's
 *   `userId`), wherever it runs.
 * - Anything else in a project — a task — runs as that project, except in a
 *   person's personal project, where it runs as that person and nobody else.
 *   A person runner is never allowed in a shared project's storage outside a
 *   chat, so a person's own credentials never reach a shared project's task.
 */
export function runnerBoundaryMismatch(args: {
  runner: CapabilityRunner
  storage: RunStorage | null
  sessionType: string
  invokerUserId: string
}): string | null {
  const { runner, storage, sessionType, invokerUserId } = args
  if (!storage) return 'a run needs a storage boundary'
  if (sessionType === 'chat' && (runner.kind !== 'person' || runner.userId !== invokerUserId)) {
    return 'a chat must run for the person who invoked it'
  }
  if (storage.ownerType === 'user') {
    return runner.kind === 'person' && runner.userId === storage.ownerId
      ? null
      : "only the owner of a person's own storage can run in it"
  }
  if (runner.kind === 'project') {
    return runner.projectId === storage.ownerId ? null : 'the project runner names a different project'
  }
  if (sessionType === 'chat') return null
  if (storage.personalOwnerId === undefined) return 'only a chat runs for a person inside a shared project'
  return runner.userId === storage.personalOwnerId
    ? null
    : "only its owner runs a task in a person's personal project"
}

/**
 * Reads the run's person off a verified token's payload (`onBehalfOfUserId`),
 * or null when it is absent or malformed. Null means nobody started the run
 * (or hq minted the token before the claim existed), never a person's start.
 */
export function parseCapabilityOnBehalfOf(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

/**
 * The live preview a run's app tools act on (live preview spec section 4, *The app*), signed by hq: set only for a run
 * on a branch (or `main`) that has a live preview, while it is open. The app tools and the install-script rule are
 * authorised by this, never by who the run acts for.
 */
export interface CapabilityLivePreview {
  livePreviewId: string
  workspaceId: string
  /** The branch's name, or `main`'s. */
  branch: string
}

/** Reads the live-preview claim off a verified token's payload, or null when it is absent or malformed. */
export function parseCapabilityLivePreview(value: unknown): CapabilityLivePreview | null {
  if (typeof value !== 'object' || value === null) return null
  const v = value as Record<string, unknown>
  const nonEmpty = (s: unknown): s is string => typeof s === 'string' && s.length > 0
  if (!nonEmpty(v.livePreviewId) || !nonEmpty(v.workspaceId) || !nonEmpty(v.branch)) return null
  return { livePreviewId: v.livePreviewId, workspaceId: v.workspaceId, branch: v.branch }
}

/**
 * Reads the organisation's trusted package scopes off a verified token's payload (`CapabilityClaims.trustedPackageScopes`).
 * Anything that is not a list of scopes (`readPackageScopes`) trusts none.
 */
export function parseCapabilityPackageScopes(value: unknown): string[] {
  return readPackageScopes(value) ?? []
}

/**
 * Whether a run may act in a live preview: its signed claim names that very live preview, workspace and branch, and
 * the live preview has not stopped. Returns why not, or null when it may. The site holds the live preview; this is its
 * one rule.
 */
export function livePreviewCapabilityMismatch(
  claim: CapabilityLivePreview | null,
  preview: { livePreviewId: string; workspaceId: string; branch: string; stopped: boolean } | null,
): string | null {
  if (!claim) return 'the run is not bound to a live preview'
  if (!preview || preview.livePreviewId !== claim.livePreviewId) return 'the run is bound to another live preview'
  if (preview.workspaceId !== claim.workspaceId) return "the run's live preview is on another workspace"
  if (preview.branch !== claim.branch) return "the run's live preview is on another branch"
  return preview.stopped ? 'the live preview has stopped' : null
}

/** Capability payload (§2a claim shape). exp is the JWT `exp` claim. */
export interface CapabilityClaims {
  tokenType: 'capability'
  userId: string
  /** Who the run is for — see `CapabilityRunner`. */
  runner: CapabilityRunner
  /**
   * Set when the run works in a person's personal project (not Your space,
   * which has no storage of its own): that project and its person. The one
   * thing that lets a task there run as the person; a site that does not know
   * it refuses such a run, as before.
   */
  personalProject?: CapabilityPersonalProject
  /**
   * What started the run — a person, a boundary's pulse, or a task's schedule
   * (adr-0087). Signed so hq can read it inside a tool call: what a run may do
   * (set a schedule, the starting value `run_task` passes on) depends on it.
   * hq reads it only from tokens it minted; a missing value is never a person.
   */
  startedBy: RunStartedBy
  /**
   * The person the run's work is for, when a person started it inside a task:
   * the sender of a message into the task's session, or whoever started the
   * task run. A task the run creates is on their behalf (adr-0089). It says who
   * the work is for and authorises nothing (ADR-0060); hq still checks that
   * person's access wherever it is used. Absent for a plain chat (its person
   * is its owner) and for a run nobody started (its task's person).
   */
  onBehalfOfUserId?: string
  agentId: string
  sessionId: string
  projectId: string | null    // null = personal/global chat (§1a)
  workspaceId: string | null  // primary location's workspace; null = an owner's files/ home
  taskId: string | null       // null = open-ended chat
  /** The person's role, set only for a chat in their own storage (the one kind of run that acts as its person);
   *  null for every other run. It authorises nothing in the control plane, which reads the current role of the
   *  person the run is for at every call. */
  role: 'ADMIN' | 'MEMBER' | null
  siteId: string              // the site holding the workspace (logical ref, §2b)
  permissions: CapabilityEffectivePermissions
  /** Since 1.12: set only for a run on a branch with a live preview, while it is open. */
  livePreview?: CapabilityLivePreview
  /**
   * Since 1.12: the npm scopes the organisation's admins trust (`@fernhill`), whose packages' install scripts run
   * without the install-script rule's lookups (adr-0170), wherever the run installs packages. Read from hq's setting
   * at every mint and renewal. Absent: none.
   */
  trustedPackageScopes?: string[]
}
