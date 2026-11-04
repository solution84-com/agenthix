/** Resolves the boundary's one bind, the folders inside it, and the run's cwd (ADR-0039 §2, §9, §10; ADR-0074; ADR-0079).
 *
 * CONTAINER PATHS MIRROR THE SITE'S DISK, BY ID (ADR-0074, person-scoped
 * execution spec §1): a container sees storage at the site's own path with the
 * site root removed — `/projects/<project id>/files`,
 * `/projects/<project id>/workspaces/<workspace id>`, `/users/<person id>/files`.
 * A harness files each conversation under its working directory, so that path
 * must never change while the conversation can be resumed, and names do change:
 * renaming a project or a workspace must not end every conversation in it. The
 * readable names reach the agent through the prompt instead, as each folder's
 * `description` (`resolveAccessibleLocations`).
 *
 * ACCESS TO A BOUNDARY IS ACCESS TO ALL OF IT (ADR-0079): the container binds
 * the owner's folder once (`resolveBoundaryMount`), a function of the owner
 * alone, so no run can widen or narrow it and a workspace created while the
 * container runs appears in it without a rebuild. The CWD still varies per run
 * (`resolvePrimaryContainerDir`) and is always a path INSIDE that bind — a task
 * run's cwd is under `tasks/`, a workspace run's under `workspaces/`, and the
 * agenda of the person a run is working with (`resolveAgendaContainerPath`) is
 * under `members/`.
 */
import type { WorkspaceOwnerType } from '@prisma/client'
import type { LocationRef } from '../../server/storage/paths'
import { AGENDA_FILE_NAME, getAgendaFilePath, hasAgendaIn } from '../agendaService'
import type { LocationMount } from './containerTypes'

export const PLURAL_OWNER: Record<WorkspaceOwnerType, string> = {
  project: 'projects',
  user: 'users',
}

/**
 * The storage location a run is bound to. `name` is the owner's current name
 * as hq holds it — a project's, from the dispatch context — used only to tell
 * the agent what a folder is; no path is ever built from it.
 */
export interface StorageOwner {
  ownerType: WorkspaceOwnerType
  ownerId: string
  name?: string
}

/**
 * The owner's current name from hq's dispatch context
 * (`RunContextPayload.mounts.ownerSlugs`, keyed by owner id), or undefined. A
 * person's own storage needs none — it is described as theirs. A missing name
 * costs the prompt a label and nothing else, since no path depends on it.
 */
export function ownerDisplayName(loc: { ownerType: WorkspaceOwnerType; ownerId: string }, ownerSlugs: Record<string, string>): string | undefined {
  return loc.ownerType === 'project' ? ownerSlugs[loc.ownerId] : undefined
}

/** The container-side root of one owner's storage: its site path, site root removed. */
function containerOwnerBase(ownerType: WorkspaceOwnerType, ownerId: string): string {
  return `/${PLURAL_OWNER[ownerType]}/${ownerId}`
}

const ARTEFACTS_DESCRIPTION =
  'throwaway things you make for people in a conversation (a draft, a table, a comparison): save each as one file ' +
  'directly in this folder, no subfolder, and link to it in your reply as `[title](artefacts/<file name>)` — for ' +
  'example `[Pricing options](artefacts/pricing-options.md)`. Anything meant to be kept belongs in files instead'

/** Whether an owner's storage is shared between people, so each of them has an
 *  own area in it (close-out spec §6.1). A person's own storage is shared with
 *  nobody, so there is no second person there to give a folder to — their
 *  drafts and their agenda are simply theirs, in their files home. One
 *  predicate, read by both the folder list and the agenda path below. */
function ownerHasMemberAreas(ownerType: WorkspaceOwnerType): boolean {
  return ownerType === 'project'
}

/**
 * The one bind a boundary's container has of its storage: the owner's whole
 * folder, at its site path with the site root removed (ADR-0079).
 */
export function resolveBoundaryMount(owner: { ownerType: WorkspaceOwnerType; ownerId: string }, siteHostPath: string): LocationMount {
  const plural = PLURAL_OWNER[owner.ownerType]
  return { hostDir: `${siteHostPath}/${plural}/${owner.ownerId}`, containerDir: containerOwnerBase(owner.ownerType, owner.ownerId) }
}

/**
 * The folders inside a boundary, described for the prompt — never binds of
 * their own; they arrive with the boundary's one bind (`resolveBoundaryMount`).
 *
 * A project has its `files/`, its `artefacts/`, every one of its workspaces,
 * its `tasks/` root and its `members/` root; a person has their `files/`,
 * their `artefacts/`, every one of their workspaces and the `tasks/` root of
 * their personal project. Knowledge is not among them: it lives outside the
 * owner's folder (`getKnowledgeDir`) and a run reaches it only through the
 * knowledge tools. Every path belongs to that one owner. The workspaces are the ones
 * listed when the run launched; one created later is still inside the bind,
 * just not named in this run's prompt.
 *
 * Both sides are the same id-keyed path, the container side with the site root
 * removed (ADR-0074). The names — the project's and each workspace's — ride in
 * `description`, which the prompt prints beside the path.
 */
/** @internal exported for containerPrep.ts (production consumer) and unit tests */
export function resolveAccessibleLocations(
  owner: StorageOwner,
  siteHostPath: string,
  /** Every workspace of this owner, with its current name for the prompt. */
  workspaces: { id: string; name: string }[],
): LocationMount[] {
  const { hostDir: hostBase, containerDir: containerBase } = resolveBoundaryMount(owner, siteHostPath)

  const seen = new Set<string>()
  const locations: LocationMount[] = []
  const add = (segment: string, description?: string) => {
    const containerDir = `${containerBase}/${segment}`
    if (seen.has(containerDir)) return
    seen.add(containerDir)
    locations.push({ hostDir: `${hostBase}/${segment}`, containerDir, ...(description ? { description } : {}) })
  }

  add('files', filesDescription(owner))
  // Every owner kind has an artefacts root — anything an agent produces was
  // produced for somebody, and this is where hq reads it back from: it lists
  // the files directly in it, and opens the link the reply makes to one.
  add('artefacts', ARTEFACTS_DESCRIPTION)

  for (const { id, name } of workspaces) {
    add(`workspaces/${id}`, `workspace ${quoteName(name)}`)
  }

  // Both owner kinds hold tasks: a project's, and the tasks of a person's personal project, which run in that
  // person's own storage (agents own schedule spec §4).
  add('tasks', owner.ownerType === 'project'
    ? 'task working directories, one per task in this project'
    : "task working directories, one per task in this person's personal project")

  if (ownerHasMemberAreas(owner.ownerType)) {
    add('members', "each member's own area in this project: their drafts and their agenda")
  }

  return locations
}

/** A name as the prompt prints it. Quoted, so a name cannot read as part of the sentence around it. */
function quoteName(name: string): string {
  return `"${name.replace(/\s+/g, ' ').trim()}"`
}

function filesDescription(owner: StorageOwner): string {
  if (owner.ownerType === 'user') return "this person's own files"
  return owner.name ? `files of the project currently named ${quoteName(owner.name)}` : "the project's files"
}

/**
 * The run's working directory — the one thing that still varies per run. It is
 * always a path inside `resolveAccessibleLocations`'s set for the same owner,
 * and never a bind of its own.
 *
 * A task run works in `tasks/<taskId>` beneath the mounted tasks root, and a
 * workspace run in `workspaces/<workspaceId>`: ids on both sides of the bind,
 * so a rename never moves the directory a harness filed a conversation under
 * (ADR-0074).
 *
 * Every owner's set carries a tasks root. There is no fallback: the cwd has to
 * be a path that exists inside the mounted set.
 */
export function resolvePrimaryContainerDir(loc: LocationRef): string {
  const base = containerOwnerBase(loc.ownerType, loc.ownerId)
  if (loc.taskId) return `${base}/tasks/${loc.taskId}`
  if (loc.workspaceId) return `${base}/workspaces/${loc.workspaceId}`
  return `${base}/files`
}

/**
 * Where the run can reach the agenda of the person it is working with
 * (close-out spec §6.1) — the container-side path, built here rather than in
 * the storage-paths module because this is where container paths are built, and
 * built from the same id-keyed base as every mount above.
 *
 * It is therefore always a path INSIDE `resolveAccessibleLocations`'s set for
 * the same owner: the person's own area under the mounted members root in a
 * project, and their files home in their own space.
 */
export function resolveAgendaContainerPath(owner: { ownerType: WorkspaceOwnerType; ownerId: string }, userId: string): string {
  const base = containerOwnerBase(owner.ownerType, owner.ownerId)
  return ownerHasMemberAreas(owner.ownerType)
    ? `${base}/members/${userId}/${AGENDA_FILE_NAME}`
    : `${base}/files/${AGENDA_FILE_NAME}`
}

/**
 * The two agenda paths a run needs: the host path the prompt builder reads the
 * file from, and the path the RUN sees, which is the one the prompt prints.
 *
 * The two differ only under container isolation; without it the run sees the
 * host's own paths, which is the same decision `resolveVisibleClaudeHome`
 * makes for the run's Claude home. Null when this person has no own area
 * in the storage the run works in, which is the one case there is no agenda to
 * name.
 */
export function resolveRunAgenda(
  loc: LocationRef,
  userId: string,
): { hostPath: string; visiblePath: string } | null {
  if (!hasAgendaIn(loc, userId)) return null
  const hostPath = getAgendaFilePath(loc, userId)
  if (process.env.AGENT_CONTAINER_ISOLATION !== 'true') return { hostPath, visiblePath: hostPath }
  return { hostPath, visiblePath: resolveAgendaContainerPath(loc, userId) }
}
