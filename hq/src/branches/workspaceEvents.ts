/**
 * A workspace's socket room, `workspace:<id>` (core's `client/workspaceSocket.ts`): what hq tells the people who have
 * the workspace open when one of its branches or its `main` changes. Each event says what changed; the screen reads
 * again. Who may join is `workspaceRoom.ts`'s.
 */
import {
  WORKSPACE_SOCKET, type WorkspaceBranchChange, type WorkspaceBranchEvent, type WorkspaceMainChange, type WorkspaceMainEvent,
} from '@agenthix/core'

export const workspaceRoom = (workspaceId: string): string => `workspace:${workspaceId}`

type Io = { to(room: string): { emit(event: string, payload: unknown): unknown } }

function io(): Io | undefined {
  return (globalThis as { __wasp_io__?: Io }).__wasp_io__
}

export function emitBranchChange(b: { workspaceId: string; id: string; name: string }, change: WorkspaceBranchChange): void {
  const event: WorkspaceBranchEvent = { workspaceId: b.workspaceId, branchId: b.id, name: b.name, change }
  io()?.to(workspaceRoom(b.workspaceId)).emit(WORKSPACE_SOCKET.branch, event)
}

export function emitMainChange(workspaceId: string, change: WorkspaceMainChange, version: number, branchId: string | null = null): void {
  const event: WorkspaceMainEvent = { workspaceId, change, version, branchId }
  io()?.to(workspaceRoom(workspaceId)).emit(WORKSPACE_SOCKET.main, event)
}
