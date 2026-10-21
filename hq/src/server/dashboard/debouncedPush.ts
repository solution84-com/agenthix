import { prisma } from 'wasp/server'
import type { DashboardSnapshot } from '@agenthix/core'
import { composeSnapshot } from './snapshot'
import { listSubscribers } from './subscriptions'
import { connectedPeople, emitToPeople, PERSON_EVENTS } from '../personEvents'

const DEBOUNCE_MS = 500

let pending: ReturnType<typeof setTimeout> | null = null

// Composed once per distinct viewer id, not once per socket — several sockets
// (tabs, devices) can belong to the same person, and each would otherwise pay
// for its own `entitledProjectsFilter` query and project read on every push.
async function flush(): Promise<void> {
  pending = null
  // What needs a person is read again by a client that is not showing the dashboard.
  emitToPeople(connectedPeople(), PERSON_EVENTS.needsYouChanged)
  const subscribers = listSubscribers()
  if (subscribers.length === 0) return
  const byViewer = new Map<string, Promise<DashboardSnapshot>>()
  for (const [socket, userId] of subscribers) {
    try {
      let snap = byViewer.get(userId)
      if (!snap) { snap = composeSnapshot(prisma, userId); byViewer.set(userId, snap) }
      socket.emit('dashboard:snapshot', await snap)
    } catch {
      // best-effort per subscriber; one viewer's failure must not drop the rest
    }
  }
}

export function triggerSnapshotPush(): void {
  if (pending) return
  pending = setTimeout(() => { void flush() }, DEBOUNCE_MS)
}

export function __resetForTests(): void {
  if (pending) { clearTimeout(pending); pending = null }
}
