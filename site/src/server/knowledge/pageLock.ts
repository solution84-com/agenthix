/**
 * One change at a time per page. A change waits for the one before it on the same page to finish, so the second of
 * two concurrent writes reads the first's result and is refused as a conflict, never interleaved with it.
 *
 * In-process only: one site process serves an owner's knowledge, and nothing else writes it (it is not mounted).
 */
import type { KnowledgeOwnerRef } from '@agenthix/core'

const tails = new Map<string, Promise<void>>()

export function pageLockKey(owner: KnowledgeOwnerRef, page: string): string {
  return `${owner.ownerType}\u0000${owner.ownerId}\u0000${page}`
}

export async function withPageLock<T>(owner: KnowledgeOwnerRef, page: string, fn: () => Promise<T> | T): Promise<T> {
  const key = pageLockKey(owner, page)
  const before = tails.get(key) ?? Promise.resolve()
  let release!: () => void
  const mine = new Promise<void>(resolve => { release = resolve })
  const tail = before.then(() => mine)
  tails.set(key, tail)
  try {
    await before
    return await fn()
  } finally {
    release()
    if (tails.get(key) === tail) tails.delete(key)
  }
}
