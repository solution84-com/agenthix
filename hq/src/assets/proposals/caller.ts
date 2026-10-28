/**
 * The run that calls `propose_skill`, from its verified capability and hq's records, never from a tool argument (spec
 * part 5; security review H5): the run must be this capability's and still going; the person is its on-behalf-of
 * person (`personOfRun`), as `propose_workflow` takes its proposer; and whether it is that person's own interactive
 * conversation is decided the way their skills follow them (`isOwnConversation`): a turn of their own chat, or work
 * their own conversation handed to an agent. A task's run, a scheduled or automated one, or one someone else started
 * never is.
 */
import { prisma } from 'wasp/server'
import { ControlPlaneError, type CallerContext } from '../../server/controlplane/types'
import { personOfRun } from '../../server/controlplane/runOnBehalfOf'
import * as siteRuntimeStore from '../../sessions/siteRuntimeStore'
import { isOwnConversation } from '../delivery/personSkills'
import { PROPOSE_SKILL_TOOL } from './types'

export type ProposingRun = {
  agentId: string
  /** The site's run id: what the card, the limit and the record name. */
  runId: string
  /** The run's on-behalf-of person. */
  forUserId: string
  ownConversation: boolean
  /** The run's project; null in a chat of the person's own. */
  projectId: string | null
}

export async function proposingRun(ctx: CallerContext, runId: string | undefined): Promise<ProposingRun> {
  const tool = PROPOSE_SKILL_TOOL
  if (ctx.kind !== 'run') throw new ControlPlaneError('forbidden', `${tool} is for an agent's run`)
  if (!runId) throw new ControlPlaneError('invalid', `${tool} needs the run it is called from, which this site did not say`)
  const { claims } = ctx
  const run = await siteRuntimeStore.getRun(claims.siteId, runId)
  if (!run || run.sessionId !== claims.sessionId || (run.taskId ?? null) !== (claims.taskId ?? null)) {
    throw new ControlPlaneError('forbidden', `${tool} names a run that is not this one`)
  }
  if (run.status !== 'RUNNING' && run.status !== 'PENDING') throw new ControlPlaneError('invalid', 'This run has already ended')
  const session = await prisma.agentSession.findUnique({
    where: { id: claims.sessionId }, select: { sessionType: true, taskId: true, userId: true, conversationId: true },
  })
  const person = await personOfRun(claims, session ? { sessionType: session.sessionType, taskId: session.taskId } : null)
  if (!person) throw new ControlPlaneError('forbidden', `${tool}: this run is on behalf of no one`)
  return { agentId: claims.agentId, runId: run.id, forUserId: person, ownConversation: await ownConversationOf(claims, session, person), projectId: claims.projectId }
}

type Session = { sessionType: string; taskId: string | null; userId: string; conversationId: string | null } | null

export async function ownConversationOf(
  claims: { startedBy: string; taskId: string | null }, session: Session, person: string,
): Promise<boolean> {
  if (!session || claims.startedBy !== 'person' || claims.taskId || session.taskId || session.sessionType !== 'chat') return false
  const conversation = session.conversationId
    ? await prisma.conversation.findUnique({ where: { id: session.conversationId }, select: { openedById: true, home: true } })
    : null
  return isOwnConversation({
    taskId: null, sessionUserId: session.userId, senderId: person, conversationId: session.conversationId, conversation,
  })
}
