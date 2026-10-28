/**
 * Where a `propose_skill` call lands (spec part 5 *Proposing*; D24; security review H5). Pure. A draft only from the
 * person's own interactive conversation, where that person may edit at the aimed level, and only for a skill that is
 * edited in place: any other run, Bypassed or not, an administrator's task run included, makes a proposal. Neither is
 * ever live: a draft and a proposal reach no agent until a person publishes or accepts it.
 */
export type Landing = 'draft' | 'proposal'

export type RouteFacts = {
  /** A turn of the person's own conversation, or work it handed to an agent on their behalf. */
  ownConversation: boolean
  /** The person may edit a draft at the aimed level (the policy's `editDraft`). */
  mayEdit: boolean
  /** It edits a Library skill another publisher signed: only a person makes the organisation's own copy of it. */
  editsSigned: boolean
}

export function landingOf(f: RouteFacts): Landing {
  return f.ownConversation && f.mayEdit && !f.editsSigned ? 'draft' : 'proposal'
}
