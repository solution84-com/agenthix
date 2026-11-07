/**
 * A request for the person's okay in the card's words (conversation spec, Approvals): who asks, what, and, for the
 * lead's own call, what the call names. One phrase serves the card's first line and the waiting strip.
 */
import type { ApprovalRequestBody } from '../../../shared/conversations/protocol'

type Asked = Pick<ApprovalRequestBody, 'title' | 'what' | 'askedBy'>

const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1)

/**
 * What is asked, as the end of "Writer asks to …". A `what` that is a sentence naming the agent ("Writer will
 * merge …") or the title with the call's arguments gives way to the title; any other `what` is the phrase.
 */
export function askedPhrase(r: Asked): string {
  const what = r.what?.trim()
  if (!what || what.startsWith(`${r.askedBy} `) || what.startsWith(`${r.title} (`)) return lowerFirst(r.title)
  return lowerFirst(what)
}

/** What the lead's call names, for its line under the heading: `name: "Design"`; null when there is nothing more. */
export function askedArguments(r: Asked): string | null {
  const what = r.what?.trim()
  const lead = `${r.title} (`
  return what && what.startsWith(lead) && what.endsWith(')') ? what.slice(lead.length, -1) : null
}

/** The card's first line: "Writer asks to create team", or "asked" once it is answered or no longer waits. */
export function requestHeading(r: Asked, waiting: boolean): string {
  return `${r.askedBy} ${waiting ? 'asks' : 'asked'} to ${askedPhrase(r)}`
}
