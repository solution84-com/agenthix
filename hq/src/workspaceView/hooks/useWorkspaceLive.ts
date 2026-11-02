import { createContext, useContext, useEffect, useState } from 'react'
import { useSocket } from 'wasp/client/webSocket'
import { WORKSPACE_SOCKET, type WorkspaceBranchEvent, type WorkspaceMainEvent } from '@agenthix/core'

/**
 * Joins the workspace's room while the view is open (spec part 1, *Live updates*). Each event says only what changed,
 * so the count it returns moves on every one, and every reader in the view reads again when it does
 * (`useOnWorkspaceChange`). Joining again after a reconnect also counts, since events may have been missed.
 */
export function useWorkspaceLive(workspaceId: string): number {
  const { socket } = useSocket()
  const [changes, setChanges] = useState(0)
  useEffect(() => {
    if (!socket) return
    const mine = (e: { workspaceId: string }) => e.workspaceId === workspaceId
    const onBranch = (e: WorkspaceBranchEvent) => { if (mine(e)) setChanges(n => n + 1) }
    const onMain = (e: WorkspaceMainEvent) => { if (mine(e)) setChanges(n => n + 1) }
    const join = () => socket.emit(WORKSPACE_SOCKET.subscribe, workspaceId)
    const onReconnect = () => { join(); setChanges(n => n + 1) }
    socket.on(WORKSPACE_SOCKET.branch, onBranch)
    socket.on(WORKSPACE_SOCKET.main, onMain)
    socket.on('connect', onReconnect)
    join()
    return () => {
      socket.off(WORKSPACE_SOCKET.branch, onBranch)
      socket.off(WORKSPACE_SOCKET.main, onMain)
      socket.off('connect', onReconnect)
      socket.emit(WORKSPACE_SOCKET.unsubscribe, workspaceId)
    }
  }, [socket, workspaceId])
  return changes
}

export const WorkspaceChangesContext = createContext(0)

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
