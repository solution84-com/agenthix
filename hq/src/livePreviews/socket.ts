/**
 * What hq tells the people who have a workspace open about its live previews (core's `client/workspaceSocket.ts`):
 * that one changed (its state, its apps, its services, a question), and that its view should reload. Each event says
 * what changed; the screen reads again. The room is the workspace's (`branches/workspaceEvents.ts`).
 */
import {
  WORKSPACE_SOCKET, type WorkspaceLivePreviewChange, type WorkspaceLivePreviewEvent, type WorkspaceLivePreviewReloadEvent,
} from '@agenthix/core'
import { workspaceRoom } from '../branches/workspaceEvents'

type Io = { to(room: string): { emit(event: string, payload: unknown): unknown } }

function io(): Io | undefined {
  return (globalThis as { __wasp_io__?: Io }).__wasp_io__
}

export function emitLivePreviewChange(
  p: { id: string; workspaceId: string; branchId: string | null },
  change: WorkspaceLivePreviewChange,
): void {
  const event: WorkspaceLivePreviewEvent = { workspaceId: p.workspaceId, livePreviewId: p.id, branchId: p.branchId, change }
  io()?.to(workspaceRoom(p.workspaceId)).emit(WORKSPACE_SOCKET.livePreview, event)
}

export function emitLivePreviewReload(p: { id: string; workspaceId: string }, by: string): void {
  const event: WorkspaceLivePreviewReloadEvent = { workspaceId: p.workspaceId, livePreviewId: p.id, kind: 'reload', by }
  io()?.to(workspaceRoom(p.workspaceId)).emit(WORKSPACE_SOCKET.livePreviewReload, event)
}

export function emitLivePreviewAuto(p: { id: string; workspaceId: string }, auto: boolean): void {
  const event: WorkspaceLivePreviewReloadEvent = { workspaceId: p.workspaceId, livePreviewId: p.id, kind: 'auto', auto }
  io()?.to(workspaceRoom(p.workspaceId)).emit(WORKSPACE_SOCKET.livePreviewReload, event)
}
