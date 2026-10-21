/**
 * Who sent each message in a session (every-screen-reviewed spec §9, "Names on
 * messages"). The site records the sender's id on the message; hq, which holds
 * the people, names them. The viewer's own messages carry no name, so they read
 * as "You"; so does a message with no recorded sender.
 */
import { usernames } from '../projects/onBehalfOfOperations'

/** A sender who has since been removed from the organisation. */
export const UNKNOWN_AUTHOR = 'Someone'

export type WithAuthorName<T> = T & { authorName: string | null }

export async function withAuthorNames<T extends { authorId?: string | null }>(
  entries: T[],
  viewerId: string,
): Promise<Array<WithAuthorName<T>>> {
  const others = [...new Set(entries.map(e => e.authorId).filter((id): id is string => !!id && id !== viewerId))]
  const names = others.length > 0 ? await usernames(others) : new Map<string, string>()
  return entries.map(e => ({
    ...e,
    authorName: e.authorId && e.authorId !== viewerId ? names.get(e.authorId) ?? UNKNOWN_AUTHOR : null,
  }))
}

/** A person's name for a run's history ("Stopped by ana"), or undefined when they cannot be named. */
export async function personName(userId: string): Promise<string | undefined> {
  return (await usernames([userId])).get(userId)
}
