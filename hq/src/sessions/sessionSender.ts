/**
 * Who may send into a conversation — a message, Try again, Send now, Cancel on
 * a waiting message, Summarise now. A task's session is shared by everyone who
 * works in its project (spec §3); any other conversation is its person's alone
 * (adr-0041), and a refused caller is told it does not exist. Owning a chat is
 * not entitlement to the project it works in: membership is checked again
 * (R-197, adr-0102). A closed conversation takes nothing more (adr-0076).
 *
 * Decided from hq's own copy, before any call to the site.
 */
import { HttpError, prisma } from 'wasp/server'
import { requireTaskAccess } from '../projects/resourceEntitlement'
import { requireStillEntitledToSessionProject, tasklessSessionPerson } from './sessionEntitlement'
import { isSessionClosed, SessionClosedError } from './closedSession'

export async function requireSessionSender(sessionId: string, userId: string, verb = 'Running this session') {
  const session = await prisma.agentSession.findUnique({ where: { id: sessionId }, include: { agent: true } })
  if (!session) throw new HttpError(404, 'Session not found or access denied')
  if (session.taskId) {
    await requireTaskAccess(session.taskId, userId, verb)
  } else if (tasklessSessionPerson(session) !== userId) {
    // A task session whose task was deleted is nobody's to send into, the admin its row names included.
    throw new HttpError(404, 'Session not found or access denied')
  }
  await requireStillEntitledToSessionProject(session, userId)
  if (isSessionClosed(session)) throw new HttpError(409, new SessionClosedError(session.closedReason ?? null).message)
  return session
}
