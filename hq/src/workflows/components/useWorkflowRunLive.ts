import { useEffect, useRef } from 'react'
import { useSocket } from 'wasp/client/webSocket'
import { WORKFLOW_RUN_SOCKET_EVENT, type WorkflowRunSocketEvent } from '../runsSocketEvent'

/**
 * Calls `onChange` whenever the run changes, or any run does when `runId` is null. The page still re-reads on a timer
 * while the run is active, as a backstop.
 */
export function useWorkflowRunLive(runId: string | null, onChange: () => void): void {
  const { socket } = useSocket()
  const latest = useRef(onChange)
  latest.current = onChange
  useEffect(() => {
    if (!socket) return
    const listener = (data: WorkflowRunSocketEvent) => { if (runId === null || data.runId === runId) latest.current() }
    socket.on(WORKFLOW_RUN_SOCKET_EVENT, listener)
    return () => { socket.off(WORKFLOW_RUN_SOCKET_EVENT, listener) }
  }, [socket, runId])
}
