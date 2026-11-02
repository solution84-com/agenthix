/**
 * A conversation started in a workspace (live preview spec, part 1, *main has no conversation of its own*): it
 * remembers its workspace before anything runs, and its work in the workspace's own place is done there, on a branch
 * of its own made at its first run when the workspace has Git. The conversation's lead does not work in the workspace
 * itself; its worker in that place does.
 */
import { HttpError, prisma } from 'wasp/server'
import { agentChoicesFor } from '../conversations/primaryAgent'
import { reachWorkspace, requireUser } from './workspaceAccess'

type Ctx = { user?: { id: string } | null }

export async function startWorkspaceConversation(args: { workspaceId: string }, context: Ctx): Promise<{ conversationId: string }> {
  const userId = requireUser(context)
  // Talking to the branch's agent is acting in the workspace: a Viewer reads and sends nothing.
  const ws = await reachWorkspace(args?.workspaceId, userId, 'work')
  const home = ws.ref.ownerType === 'project' ? 'PROJECT' as const : 'PERSON' as const
  const projectId = home === 'PROJECT' ? ws.ref.ownerId : null
  const agentId = (await agentChoicesFor({ home, projectId: projectId ?? undefined }, userId))[0]?.id
  if (!agentId) throw new HttpError(409, home === 'PROJECT' ? 'Add an agent to this project to talk to it. Nothing was changed.' : 'There is no agent to talk to yet. Nothing was changed.')
  const conversation = await prisma.conversation.create({
    data: { home, projectId, openedById: userId, agentId, workspaceId: ws.ref.workspaceId },
    select: { id: true },
  })
  return { conversationId: conversation.id }
}
