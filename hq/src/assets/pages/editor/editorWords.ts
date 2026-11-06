/**
 * What the editor says about its draft (spec part 2 *Editing: draft, then publish*; walkthrough finding 8): the state of
 * the draft that saves itself, and why *Publish* can't be used whenever it can't. Pure.
 */

/** How long after the person stops typing the draft saves itself. */
export const AUTOSAVE_MS = 1000

export type SaveFacts = {
  /** The working copy differs from what the server holds: a save is pending. */
  dirty: boolean
  saving: boolean
  /** Why the last save was refused, until the next edit tries again. */
  failed: string | null
  /** The draft changed under the person (an agent or a colleague saved); saving waits for them. */
  moved: boolean
  revision: number | null
}

export function saveStatus(s: SaveFacts): string {
  if (s.moved) return 'Not saved: the draft changed while you were editing.'
  if (s.dirty && s.failed) return `Couldn’t save: ${s.failed}`
  if (s.saving || s.dirty) return 'Saving…'
  return s.revision !== null ? 'Saved' : 'No changes yet'
}

export type PublishFacts = Omit<SaveFacts, 'revision'> & {
  mayPublish: boolean
  /** A place's skill rather than a Library one: who publishes, and what "the version" is, differ. */
  place: boolean
  /** Nothing differs from the version in use. */
  nothing: boolean
  /** A check fails. */
  blocked: boolean
  /** Where the failing checks are: "1 problem in SKILL.md, line 15". */
  problems?: string
  inUse: string | null
}

/** Why *Publish* can't be used now, or null when it can. A pending save holds it, so only a revision seen is published (D24). */
export function publishBlock(s: PublishFacts): string | null {
  if (!s.mayPublish) return s.place ? 'Publishing is for this place’s administrators.' : 'Publishing is for administrators and Library maintainers.'
  if (s.moved) return 'The draft changed while you were editing. Load their version or keep yours before publishing.'
  if (s.dirty && s.failed) return 'Your latest change isn’t saved, so it can’t be published yet.'
  if (s.dirty || s.saving) return 'Saving your changes; Publish is available once they are saved.'
  if (s.nothing) return s.inUse === null ? 'There is nothing to publish yet.' : `Nothing has changed since version ${s.inUse}, ${s.place ? 'the newest version' : 'the version in use'}.`
  if (s.blocked) return s.problems ? `Publish waits for ${s.problems}.` : 'Publish waits for the problems the checks found.'
  return null
}
