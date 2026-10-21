import type { Socket } from 'socket.io'

const subscribers = new Map<Socket, string>()

export function addSubscriber(socket: Socket, userId: string): void {
  subscribers.set(socket, userId)
}

export function removeSubscriber(socket: Socket): void {
  subscribers.delete(socket)
}

export function listSubscribers(): Array<[Socket, string]> {
  return [...subscribers.entries()]
}

export function __resetForTests(): void {
  subscribers.clear()
}
