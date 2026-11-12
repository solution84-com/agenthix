/**
 * Who may see and change which memory on the memory screen (ADR-0188): a person their own memories, and nobody
 * else's. The person is `context.user`, never an argument.
 */
import { HttpError } from 'wasp/server'

export function signedIn(context: { user?: { id: string } | null }): string {
  if (!context.user) throw new HttpError(401)
  return context.user.id
}

/** A memory's id as an operation is given it: a string, never an object Prisma would read as a condition. */
export function memoryIdOf(args: unknown): string {
  const id = (args as { id?: unknown } | null | undefined)?.id
  if (typeof id !== 'string' || !id) throw new HttpError(400, 'Name one memory')
  return id
}
