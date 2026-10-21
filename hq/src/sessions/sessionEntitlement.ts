/**
 * A session resolved to the boundary that owns it (spec §6.4). A task session
 * belongs to its task's project and is reachable by that project's members —
 * its `userId` is a routing identity (TaskRunner's arbitrary-administrator
 * fallback), never an owner.
 *
 * Two rules live here because a taskless session is not always a chat.
 * `requireSessionAccess` is for the callers where it is: anything without a
 * task belongs to the person named on it. `canReachSessionContent` is for the
 * reads that also see task activity, and keeps a task session whose task was
 * deleted org-wide — see its own comment.
 */
import { HttpError } from 'wasp/server'
import { requireTaskAccess, projectOfTaskOrNull } from '../projects/resourceEntitlement'
import { entitledProjectsFilter, isProjectMember, projectStanding, requireProjectAdmin, VIEWER_REFUSAL } from '../projects/membership'
import { requireRole } from '../server/identity/requireRole'

export type SessionOwnershipFields = { userId: string; taskId: string | null }

export async function requireSessionAccess(
  session: SessionOwnershipFields,
  userId: string,
  what: string,
): Promise<void> {
  if (session.taskId) {
    await requireTaskAccess(session.taskId, userId, what)
    return
  }
  if (session.userId !== userId) throw new HttpError(403, `${what} requires being the person this session belongs to`)
}

export type SessionContentFields = {
  userId: string
  taskId: string | null
  sessionType: string
  primaryOwnerType: string | null
  primaryOwnerId: string | null
}

/**
 * The person a non-chat session belongs to because it works in their own
 * storage — a task run in their personal project (agents own schedule spec
 * §4) — or null. Such a session is that person's alone, like their chats,
 * with its task and after its task is deleted: unlike a project's task
 * session, it is never org activity.
 */
export function personalSessionOwner(
  session: { sessionType: string; primaryOwnerType?: string | null; primaryOwnerId?: string | null },
): string | null {
  if (session.sessionType === 'chat' || session.primaryOwnerType !== 'user') return null
  return session.primaryOwnerId ?? null
}

/**
 * Who may reach the CONTENT of a session that already exists — transcripts,
 * runs, tool-call logs, pending manifests, and the socket rooms those stream
 * through. Three boundaries, not two:
 *
 *   - a task-scoped session (`taskId` set) belongs to its task's project, and is reachable by that
 *     project's members;
 *   - a chat session belongs to the person it is for, and to nobody else
 *     (ADR-0041, ADMIN included);
 *   - a task session whose task was deleted (no `taskId` left, not a chat) has
 *     no project to check against and stays org-wide activity — unless it
 *     works in a person's own storage (`personalSessionOwner`), when it is
 *     that person's alone, with or without its task. Its `userId` is
 *     whichever admin was picked as a routing identity, so narrowing it to that
 *     one id would hide org activity from everyone else rather than protect
 *     anything.
 *
 * `requireSessionAccess` above is the stricter two-way rule, right where every
 * taskless session really is somebody's chat. This one answers with a boolean
 * because its callers choose their own refusal: a 404 that does not admit the
 * run exists, or a silently ignored socket join.
 */
export async function canReachSessionContent(
  session: SessionContentFields,
  userId: string | undefined,
): Promise<boolean> {
  if (!userId) return false
  const owner = personalSessionOwner(session)
  if (owner !== null) return owner === userId
  if (session.taskId) {
    const projectId = await projectOfTaskOrNull(session.taskId)
    return projectId !== null && (await isProjectMember(projectId, userId))
  }
  return session.sessionType !== 'chat' || session.userId === userId
}

/**
 * Acting on a project's task session after its task was deleted — approving its
 * tool request, stopping it, deleting it — is that project's admins'. A session
 * that recorded no project falls back to the organisation's admins.
 */
export async function requireOrphanedSessionAdmin(
  session: { primaryOwnerType?: string | null; primaryOwnerId?: string | null },
  userId: string,
  what: string,
): Promise<void> {
  if (session.primaryOwnerType === 'project' && session.primaryOwnerId) {
    await requireProjectAdmin(session.primaryOwnerId, userId, what)
    return
  }
  await requireRole({ user: { id: userId } }, 'ADMIN', what)
}

export type SessionStorageBinding = {
  primaryOwnerType?: string | null
  primaryOwnerId?: string | null
}

/**
 * Session creation checks that the person may use the storage it binds to
 * (`assertLocationAccess`), and nothing after that does — so someone removed
 * from a project, open or private (adr-0099), would otherwise keep a live chat
 * whose runs act as that project. Every path that sends a message into an
 * existing session or starts a run in it calls this at that moment, and a
 * person made the project's Viewer since is refused too (adr-0102).
 *
 * It refuses only the acting paths. Reading the person's own old transcripts
 * stays open (`canReachSessionContent` keeps a chat session with its owner). A
 * personal `user` location has no project to lose.
 */
export async function requireStillEntitledToSessionProject(
  session: SessionStorageBinding,
  userId: string,
): Promise<void> {
  if (session.primaryOwnerType !== 'project' || !session.primaryOwnerId) return
  const standing = await projectStanding(session.primaryOwnerId, userId)
  if (standing === 'none') throw new HttpError(403, 'You no longer have access to this project')
  if (standing === 'reads') throw new HttpError(403, `Talking to this project's agents needs the Member or Admin role in it. ${VIEWER_REFUSAL}`)
}

/**
 * A Prisma `where` that keeps only the sessions a person may be told of by way
 * of the project they work in: one with no task is unaffected, one bound to a
 * task needs the person entitled to that task's project. It says nothing about
 * whose chat a session is — that stays each caller's own owner rule — so the
 * pages that list an agent's sessions, runs and counts add this to that rule
 * rather than replace it (spec §6.4, SC-402).
 */
export function sessionsInEntitledProjects(userId: string) {
  // Spelled as positive branches, not a NOT: a session in somebody else's own
  // storage that is not a chat (their personal project's task run) is the one
  // taskless kind left out, and a NOT over the nullable location columns would
  // drop every location-less row with it.
  return {
    OR: [
      { taskId: null, sessionType: 'chat' },
      { taskId: null, primaryOwnerType: null },
      { taskId: null, primaryOwnerType: 'project' as const },
      { taskId: null, primaryOwnerType: 'user' as const, primaryOwnerId: userId },
      { task: { project: entitledProjectsFilter(userId) } },
    ],
  }
}
