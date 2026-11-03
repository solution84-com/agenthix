/**
 * The knowledge tools' own fixed messages (S6): each says what is wrong, who holds it and what to do, and ends
 * "Nothing was changed." when nothing was. None carries a site's address, a path on a disk or an error's text, and a
 * refusal of a level names only the levels the caller already holds.
 */
import { BRANDING } from '@agenthix/core'
import type { SiteFailure } from './deps'

const UNCHANGED = 'Nothing was changed.'

const IN_WORDS: Record<string, string> = {
  personal: 'Your space (personal:)',
  org: 'the organisation (org:)',
  platform: 'the platform guide (platform:)',
}

/** The levels a search covered, as the answer names them: `shop:, the organisation (org:) and the platform guide (platform:)`. */
export function levelsInWords(levels: readonly string[], last: 'and' | 'or'): string {
  const words = levels.map(l => IN_WORDS[l] ?? `${l}:`)
  if (words.length <= 1) return words[0] ?? ''
  return `${words.slice(0, -1).join(', ')} ${last} ${words[words.length - 1]}`
}

export const MESSAGES = {
  noLevel: (levels: string) =>
    `Name the page with its level first, as search_knowledge shows it: one of ${levels} followed by the page, such as org:how-we-work/code-review.md. ${UNCHANGED}`,
  /**
   * A level a conversation does not hold (P6, F10): out of reach, not empty. It neither says whether such a place
   * exists nor names one the conversation does not hold; the name is the caller's own.
   */
  searchNotInConversation: (asked: string, levels: readonly string[]) =>
    `"${asked}" is not among this conversation's places, so it was not searched: what is in it is not known, not empty. ` +
    `The places you can search are ${levelsInWords(levels, 'and')}. If it is a project or the person's space, ` +
    'suggest_place offers it to the person; nothing in it can be read until they add it.',
  pageNotInConversation: (asked: string, levels: readonly string[]) =>
    `"${asked}" is not among this conversation's places, so nothing in it was read: what is in it is not known, not ` +
    `empty. The places you can reach are ${levelsInWords(levels, 'and')}. If it is a project or the person's space, ` +
    `suggest_place offers it to the person; nothing in it can be read or changed until they add it. ${UNCHANGED}`,
  notInReach: (levels: string) =>
    `There is no level by that name here. The levels you can reach are ${levels}; a page's name starts with one of them, as search_knowledge shows it. ${UNCHANGED}`,
  badPage: () =>
    `That is not a page's name: give the page inside its level, such as processes/release.md, without "..", a leading / or a backslash. ${UNCHANGED}`,
  platformReadOnly: () =>
    `platform: pages describe ${BRANDING.displayName} and cannot be changed here; the maintainers change them. Change a page of this place, or of org:, instead. ${UNCHANGED}`,
  orgAdminOnly: () =>
    `Only an organisation admin, or an agent acting for one, can change org: pages. Ask an organisation admin of HQ to make this change. ${UNCHANGED}`,
  mayNotChange: () =>
    `Knowledge cannot be changed from here: only a turn answering a person, or a run that has write tools, may change it. Tell the person what should change, and they can ask for it. ${UNCHANGED}`,
  viewerOnly: (level: string) =>
    `${level}: is a project the person this acts for only reads: a Viewer reads its knowledge and changes nothing. ` +
    `Tell the person what should change, and one of its Members or Admins can change it. ${UNCHANGED}`,
  tooLarge: (maxKb: number) => `The page is over ${maxKb} KB, the most a page may be. Split it into smaller pages. ${UNCHANGED}`,
  readFirst: (name: string) =>
    `There is already a page ${name}. Read it with read_knowledge first, then write it, or change one passage with edit_knowledge. ${UNCHANGED}`,
  binary: () => `That page is not text, so it cannot be read here. ${UNCHANGED}`,
  invalidParameter: (parameter: string) =>
    `The parameter ${parameter} is not valid, so the call was not made. Check its type and range, and try again. ${UNCHANGED}`,
} as const

/** Why one level could not answer, in a refusal: a read or a change goes to that level alone. */
export function levelFailureMessage(level: string, why: SiteFailure): string {
  switch (why) {
    case 'unreachable':
      return `${level}: knowledge is unavailable: the Execution Site that holds it cannot be reached now. Try again later. ${UNCHANGED}`
    case 'outdated':
      return `${level}: knowledge is unavailable: the Execution Site that holds it needs updating first. Whoever runs this installation can update it. ${UNCHANGED}`
    case 'not_found':
      return `There is no such page in ${level}:. Search for it with search_knowledge, or check the spelling. ${UNCHANGED}`
    case 'too_large':
      return `That page is too large to read here. ${UNCHANGED}`
    case 'invalid':
      return MESSAGES.badPage()
    case 'failed':
      return `${level}: knowledge could not be reached because of an error. Try again; if it keeps failing, whoever runs this installation can find why in HQ's log. ${UNCHANGED}`
  }
}

/** Why one level is missing from a search's answer, as a line in it: the other levels still answer (S8). */
export function levelSearchNote(level: string, why: SiteFailure | 'timeout'): string {
  const reason =
    why === 'unreachable' ? 'the Execution Site that holds it cannot be reached now'
      : why === 'outdated' ? 'the Execution Site that holds it needs updating first'
        : why === 'timeout' ? 'it did not answer in time'
          : 'an error stopped it; HQ\'s log says why'
  return `[${level}: not searched: ${reason}. The other levels answered.]`
}
