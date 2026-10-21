import { useEffect } from 'react'
import type { Socket } from 'socket.io-client'

/** Mirror of Wasp's `useSocketListener` but accepting an injected socket. */
export function useSiteSocketListener<P>(
  socket: Socket | null,
  event: string,
  handler: (payload: P) => void,
): void {
  useEffect(() => {
    if (!socket) return
    socket.on(event, handler)
    return () => { socket.off(event, handler) }
  }, [socket, event, handler])
}

export function subscribeToSession(socket: Socket | null, sessionId: string): void {
  if (!socket) return
  socket.emit('subscribeToSession', sessionId)
}

export function subscribeToTask(socket: Socket | null, taskId: string): void {
  if (!socket) return
  socket.emit('subscribeToTask', taskId)
}

export function subscribeToBoard(socket: Socket | null, boardId: string): void {
  if (!socket) return
  socket.emit('subscribeToBoard', boardId)
}
