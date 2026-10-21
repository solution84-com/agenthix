/**
 * "This container name no longer refers to the container it did a moment ago."
 *
 * Announced by the runtime whenever a container is force-removed — before a
 * recreate, on an agent stop, on either sweep. Everything living INSIDE a
 * container dies with it, and anything holding a record of such a thing has to
 * be told, or it keeps a record of something that is gone.
 *
 * A seam rather than a direct call, and the direction is the whole reason it
 * exists. The preview modules import the runtime — they ask it for a container
 * name and for the hold marks — so the runtime importing the preview registry
 * back would close a cycle. Interested modules subscribe here instead, and the
 * runtime knows nothing about who is listening.
 *
 * A subscriber must not throw: this fires on a removal path that has already
 * happened and cannot be undone, so there is nothing a failure here could mean
 * except a second problem on top of the first.
 */
type Subscriber = (containerName: string) => void

const subscribers: Subscriber[] = []

export function onContainerDestroyed(fn: Subscriber): void {
  subscribers.push(fn)
}

export function notifyContainerDestroyed(containerName: string): void {
  for (const fn of subscribers) {
    try {
      fn(containerName)
    } catch {
      // A listener's failure must not become the remover's.
    }
  }
}

/** test-only */
export function _resetSubscribers(): void {
  subscribers.length = 0
}
