/**
 * Shared shapes for the agent container runtime — mounts, session identity, and
 * per-run context. Split out of AgentContainerManager.ts (phase 5d-1 hygiene) to
 * keep that file under the repo's file-size convention. Pure types + docs, no
 * behavior — importers (containerPrep.ts, locationResolver.ts, tests) reach for
 * this module directly rather than through AgentContainerManager.ts.
 */
import type { CapabilityRunner } from '@agenthix/core'
import type { SiteRunCredential } from '../../server/modelRelay/runAccess'

/**
 * One directory of a boundary's storage, on both sides of the container's bind.
 *
 * Both sides are id-keyed (ADR-0074) — the container side is the host side with
 * the site root removed, so a rename moves nothing:
 *   the boundary: {SITE_ROOT}/{plural}/{ownerId}                 → /{plural}/{ownerId}
 *   a workspace:  {SITE_ROOT}/{plural}/{ownerId}/workspaces/{id} → /{plural}/{ownerId}/workspaces/{id}
 *
 * cwd for the run is set to the primary location's containerDir (ADR-0039 §9).
 *
 * `description`: an optional label surfaced by AgentPromptBuilder's ## Filesystem
 * section after the containerDir — what the path is for, and the current name of
 * the project or workspace it holds, since the path itself carries only ids.
 */
export interface LocationMount {
  hostDir: string
  containerDir: string
  description?: string
}

/**
 * What a run's container has of its boundary's storage (ADR-0079).
 *
 * `boundary` is the ONE bind: the owner's whole folder, `/projects/<id>` or
 * `/users/<id>`, with everything in it — files, artefacts, every
 * workspace, tasks and member folders. A workspace created while the container
 * runs is a new directory inside that bind and appears in it straight away, so
 * the bind never changes for a given key.
 *
 * `folders` are the standard directories inside the boundary and each of its
 * workspaces — never binds of their own. They are what the prompt lists, each
 * with what it is for and its current name, and `_start` creates them before
 * the container starts so they exist, owned by the site's own user.
 *
 * `locationMode` (spec §6.4, phase 5d-1): 'ro' when the run's effective
 * toolset has no write tools (see runHasWriteTools, toolPermissions.ts) — the
 * kernel then enforces what the registry refuses. Applies to the boundary
 * bind, and is part of `StorageBoundaryKey` because an rw→ro flip changes no
 * bind string. Required, not optional: every caller must decide explicitly.
 * The runner's harness home, bound by `_start` rather than described here, is
 * outside it: that bind is the runner's private state rather than org work
 * data, and it is the same directory in either mode.
 */
export interface AgentMounts {
  boundary: LocationMount
  folders: LocationMount[]
  locationMode: 'rw' | 'ro'
}

/**
 * Identifies which container a run belongs to (ADR-0074): the storage location
 * it works in, who is running in it, and the mode that storage is bound in —
 * never the session, never the agent. A container belongs to one boundary and
 * one runner for its whole life and is never rebound.
 *
 * `mode` is part of the KEY, not only of the mount signature: a read-write to
 * read-only flip changes none of the bind strings (same host and container
 * paths either way), so without it the two would silently share one container
 * and the read-only enforcement would do nothing. A runner therefore holds at
 * most two containers in a boundary, one per mode.
 *
 * Naming is `containerNameFor` (containerLabels.ts). Every segment is an
 * immutable id — two projects may share a display name, and two owners or two
 * people sharing one container is precisely what this key exists to prevent.
 */
export interface StorageBoundaryKey {
  scope: 'storage'
  ownerType: 'project' | 'user'
  ownerId: string
  mode: 'rw' | 'ro'
  /**
   * Who is running: a person, or the project itself (ADR-0074). Taken from the
   * VERIFIED capability's runner claim, never from the dispatch payload — it
   * decides whose private harness home is mounted (harnessHomes.ts). In a
   * person's own storage it can only be that person.
   */
  runner: CapabilityRunner
}

/** Which container a run gets: every run is keyed by the storage it works in. */
export type ContainerKey = StorageBoundaryKey

/**
 * The run's context, attached to its container as Docker labels — never part of
 * the name (ADR-0049's labels-not-names rule, which ADR-0057 keeps). Searchable
 * with `docker ps --filter label=<namespace>.invoker=...` etc.
 *
 * `handle` and `sessionId` live here rather than in the key: a container serves
 * whichever of its runner's agents and sessions runs in that storage location
 * next, so neither identifies the container. They are still stamped as
 * labels, recording which run last (re)created it — and `handle` is what
 * `_start` seeds credentials for and `sweepIdle` writes back.
 *
 * `credential` (the phase 5d-2 severance, re-shaped at spec §6.3): the one
 * model credential this run may use (RunContextPayload.credential, decided by
 * hq from the boundary the run acts for) — replaces the in-process
 * `getLlmApiKey('anthropic')` call AgentContainerManager._start and
 * agentCredentials.checkAgentCredentials used to make against hq's own
 * Provider table, and before that the bare key this field used to carry. Not a
 * Docker label itself (never rendered as one) — carried alongside the label
 * fields because this is the object threaded from containerPrep.ts through
 * AgentContainerManager.ensureRunning into _start.
 */
export interface ContainerContext {
  /** The agent this run is for — the `<namespace>.agent` label. */
  handle: string
  /** The agent's runtime (`Agent.runtime`, dispatched by hq). Not a label and
   *  not part of any key: it decides only whether this run needs Claude Code's
   *  OAuth files to exist at all, which is what `checkAgentCredentials` probes
   *  for. An OpenCode run reaches its providers with an API key
   *  and must not be refused for want of a document it never reads. */
  runtime: string
  sessionId: string
  /** The invoking person, chat sessions only — null/undefined for autonomous or task-scoped runs. */
  invokerUserId?: string | null
  taskId?: string | null
  credential: SiteRunCredential | null
}

/**
 * Per-container-name bookkeeping (ADR-0049 idle teardown, phase 5d-1). One entry
 * per container the manager has ever started or adopted, keyed by container name —
 * which is boundary × runner shaped, so nothing here parses an agent handle or a
 * session id back out of it. Consolidates what were two separate name-keyed maps
 * (in-flight start dedup, mount signature) plus activity tracking, so a
 * container's state lives in one place.
 */
export interface ContainerState {
  /** In-flight start promise — present only while `_start` is running for this name. */
  starting?: Promise<void>
  /** In-flight removal promise — present only while sweepIdle's `docker rm -f` for
   *  this name is outstanding. Symmetric with `starting`: ensureRunning awaits it
   *  before trusting anything about this container (see sweepIdle's doc comment
   *  for the post-decision race it closes). */
  stopping?: Promise<void>
  /** Mount-set signature from the run that (re)started this container; reused only
   *  while it matches the current run's mounts. */
  mountSig?: string
  /** Count of runs currently exec-ing in this container. Never goes below 0. */
  activeRuns: number
  /** Live previews serving out of this container. A preview is not a run: it
   *  holds no concurrency slot, but it IS work
   *  somebody is watching, so neither sweep may take the container out from
   *  under it. Counted separately from `activeRuns` precisely so that it
   *  cannot be mistaken for one. */
  previewHolds?: number
  /** Date.now() at the last run start/end, the last preview start/end, or the
   *  last ensureRunning touch. */
  lastActivity: number
}
