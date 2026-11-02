import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { useSocket } from 'wasp/client/webSocket'
import {
  WORKSPACE_SOCKET, type WorkspaceBranchEvent, type WorkspaceLivePreviewEvent, type WorkspaceLivePreviewReloadEvent,
  type WorkspaceMainEvent,
} from '@agenthix/core'

/**
 * What a live preview's view acts on besides reading again: a reload asked by the agent or a person, *Auto* switched,
 * or commits on a branch (which reload a live preview with *Auto* on). `seq` moves on every one, so the same event
 * twice still counts.
 */
export type WorkspaceViewEvent =
  | { seq: number; kind: 'reload'; event: WorkspaceLivePreviewReloadEvent }
  | { seq: number; kind: 'commits'; branchId: string }

/**
 * Joins the workspace's room while the view is open (spec part 1, *Live updates*, and part 4). Each event says only
 * what changed, so the count it returns moves on every one, and every reader in the view reads again when it does
 * (`useOnWorkspaceChange`). Joining again after a reconnect also counts, since events may have been missed. A live
 * preview's reloads and a branch's commits are also handed on as they came (`useWorkspaceViewEvent`).
 */
export function useWorkspaceLive(workspaceId: string): { changes: number; event: WorkspaceViewEvent | null } {
  const { socket } = useSocket()
  const [changes, setChanges] = useState(0)
  const [event, setEvent] = useState<WorkspaceViewEvent | null>(null)
  const seq = useRef(0)
  useEffect(() => {
    if (!socket) return
    const mine = (e: { workspaceId: string }) => e?.workspaceId === workspaceId
    const onBranch = (e: WorkspaceBranchEvent) => {
      if (!mine(e)) return
      setChanges(n => n + 1)
      if (e.change === 'commits') setEvent({ seq: ++seq.current, kind: 'commits', branchId: e.branchId })
    }
    const onMain = (e: WorkspaceMainEvent) => { if (mine(e)) setChanges(n => n + 1) }
    const onPreview = (e: WorkspaceLivePreviewEvent) => { if (mine(e)) setChanges(n => n + 1) }
    const onReload = (e: WorkspaceLivePreviewReloadEvent) => { if (mine(e)) setEvent({ seq: ++seq.current, kind: 'reload', event: e }) }
    const join = () => socket.emit(WORKSPACE_SOCKET.subscribe, workspaceId)
    const onReconnect = () => { join(); setChanges(n => n + 1) }
    socket.on(WORKSPACE_SOCKET.branch, onBranch)
    socket.on(WORKSPACE_SOCKET.main, onMain)
    socket.on(WORKSPACE_SOCKET.livePreview, onPreview)
    socket.on(WORKSPACE_SOCKET.livePreviewReload, onReload)
    socket.on('connect', onReconnect)
    join()
    return () => {
      socket.off(WORKSPACE_SOCKET.branch, onBranch)
      socket.off(WORKSPACE_SOCKET.main, onMain)
      socket.off(WORKSPACE_SOCKET.livePreview, onPreview)
      socket.off(WORKSPACE_SOCKET.livePreviewReload, onReload)
      socket.off('connect', onReconnect)
      socket.emit(WORKSPACE_SOCKET.unsubscribe, workspaceId)
    }
  }, [socket, workspaceId])
  return { changes, event }
}

export const WorkspaceChangesContext = createContext(0)
export const WorkspaceEventContext = createContext<WorkspaceViewEvent | null>(null)

/** Calls `refetch` whenever the workspace's room says something changed (never on the first render). */
export function useOnWorkspaceChange(refetch: () => unknown) {
  const changes = useContext(WorkspaceChangesContext)
  const [seen, setSeen] = useState(changes)
  useEffect(() => {
    if (changes === seen) return
    setSeen(changes)
    void refetch()
  }, [changes, seen, refetch])
}

/** Calls `on` with each reload or commits event after the first render; never with one seen before. */
export function useWorkspaceViewEvent(on: (e: WorkspaceViewEvent) => void) {
  const event = useContext(WorkspaceEventContext)
  const seen = useRef(event?.seq ?? 0)
  const handler = useRef(on)
  handler.current = on
  useEffect(() => {
    if (!event || event.seq <= seen.current) return
    seen.current = event.seq
    handler.current(event)
  }, [event])
}
