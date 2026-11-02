/**
 * Joining a workspace's socket room (`workspaceEvents.ts` sends to it): refused, silently, unless the person may read
 * the workspace.
 */
import { WORKSPACE_SOCKET } from '@agenthix/core'
import { reachWorkspace } from './workspaceAccess'
import { workspaceRoom } from './workspaceEvents'

export interface WorkspaceSocket {
  id: string
  data?: { user?: { id: string } }
  join(room: string): unknown
  leave(room: string): unknown
  on(event: string, listener: (...args: unknown[]) => void): unknown
}

interface Log { warn(message: string): void }

export async function joinWorkspaceRoom(socket: WorkspaceSocket, workspaceId: unknown, log: Log): Promise<boolean> {
  const userId = socket.data?.user?.id
  if (!userId || typeof workspaceId !== 'string' || workspaceId === '' || workspaceId.length > 200) return false
  try {
    await reachWorkspace(workspaceId, userId, 'read')
  } catch {
    log.warn(`${socket.id} denied join to ${workspaceRoom(workspaceId)}: may not read this workspace`)
    return false
  }
  socket.join(workspaceRoom(workspaceId))
  return true
}

export function registerWorkspaceRoom(socket: WorkspaceSocket, log: Log): void {
  socket.on(WORKSPACE_SOCKET.subscribe, (workspaceId: unknown) => { void joinWorkspaceRoom(socket, workspaceId, log) })
  socket.on(WORKSPACE_SOCKET.unsubscribe, (workspaceId: unknown) => {
    if (typeof workspaceId === 'string' && workspaceId.length <= 200) socket.leave(workspaceRoom(workspaceId))
  })
}
