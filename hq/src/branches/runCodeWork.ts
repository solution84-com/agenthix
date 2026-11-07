/**
 * Which work a run is, for code work on branches (live preview spec, *Which work is code work*): a run of a task, or a
 * message in its thread, is the task's work in the task's workspace; a conversation's worker in a workspace (the one
 * its lead's brief named, `startWork.ts`) is that conversation's work there, on one branch per conversation and
 * workspace. Anything else is not code work and runs as before.
 */
import { HttpError, prisma } from 'wasp/server'
import type { LocationRef } from '@agenthix/core'
import { prepareCodeWork, type PreparedCodeWork } from './codeWorkDispatch'
import { firstAsk } from './whose'
import { projectStanding } from '../projects/membership'

type Session = { taskId: string | null; conversationId: string | null; primaryWorkspaceId: string | null; title?: string | null }

export type RunCodeWorkAsk = {
  session: Session
  primaryLoc: LocationRef
  personId: string
  /** The run's agent. */
  agentId: string
  runSiteId: string
  /** What the person asked in this message, when the work has nothing earlier to be named from. */
  inputText?: string
}

export async function codeWorkForRun(ask: RunCodeWorkAsk): Promise<PreparedCodeWork | null> {
  const owner = { type: ask.primaryLoc.ownerType, id: ask.primaryLoc.ownerId }
  const common = { owner, personId: ask.personId, agentId: ask.agentId, runSiteId: ask.runSiteId }
  if (ask.session.taskId) {
    const task = await prisma.task.findUnique({ where: { id: ask.session.taskId }, select: { workspaceId: true, title: true } })
    if (!task?.workspaceId) return null
    return prepareCodeWork({ ...common, work: { taskId: ask.session.taskId }, workspaceId: task.workspaceId, nameFrom: task.title })
  }
  if (ask.session.conversationId && ask.session.primaryWorkspaceId) {
    const conversationId = ask.session.conversationId
    // Checked again at each run, as the person may have become a Viewer since the brief was admitted.
    if (!(await mayChange(owner, ask.personId))) {
      throw new HttpError(403, "Changing this workspace needs the Member or Admin role in its project. Ask a project admin for it. Nothing was changed.")
    }
    const conversation = await prisma.conversation.findUnique({ where: { id: conversationId }, select: { title: true } })
    if (!conversation) return null
    const nameFrom = ask.session.title?.trim() || (await firstAsk(conversationId)) || conversation.title || ask.inputText || 'work'
    return prepareCodeWork({ ...common, work: { conversationId }, workspaceId: ask.session.primaryWorkspaceId, nameFrom })
  }
  return null
}

async function mayChange(owner: { type: 'project' | 'user'; id: string }, personId: string): Promise<boolean> {
  if (owner.type === 'user') return owner.id === personId
  return (await projectStanding(owner.id, personId)) === 'works'
}
