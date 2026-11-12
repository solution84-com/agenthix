import { useAuth } from 'wasp/client/auth'
import { isVisitorUsername, visitorNumber } from './visitors'
import { useDemo } from './useDemo'

/**
 * The name a screen greets the signed-in person by. A visitor to the demo is their display name (*Visitor 4821*), as
 * People and Settings show them, never their made-up username; everyone else, and everyone outside the demo, keeps
 * their username.
 */
export function shownName(username: string | null, displayName: string | null | undefined, demoOn: boolean): string | null {
  return demoOn && isVisitorUsername(username) && displayName ? displayName : username
}

/**
 * The handle a screen shows for a person, without its `@` (walkthrough finding 10): a demo visitor's is
 * `visitor-4821`, matching the number in their name, never their made-up username, which stays the account's own;
 * everyone else's, and everyone's outside the demo, is their username.
 */
export function shownHandle(username: string | null, demoOn: boolean): string | null {
  const n = demoOn ? visitorNumber(username) : null
  return n === null ? username : `visitor-${n}`
}

/** The shown handle with the demo read from the screen's own reading of it. */
export function useShownHandle(username: string | null): string | null {
  return shownHandle(username, useDemo().on)
}

export function useShownName(username: string | null): string | null {
  const { data: user } = useAuth()
  const demo = useDemo()
  return shownName(username, (user as { displayName?: string | null } | null | undefined)?.displayName, demo.on)
}
