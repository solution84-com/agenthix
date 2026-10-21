/**
 * Membership-ending instructions, hq → site (person-scoped execution spec §4,
 * "When membership ends").
 *
 * When a person leaves a project, a person leaves the organisation, or a
 * project is deleted, hq tells each site concerned. The site stops the
 * affected runs, removes their containers, deletes the harness homes and closes
 * the conversations there. It leaves the person's member folder and our record
 * of their conversations alone.
 *
 * hq holds an instruction for a site that is offline and replays held ones in
 * order when it reconnects, so each carries hq's `instructionId`. The site's
 * answer to the channel request is its acknowledgement, naming that id; hq
 * marks the instruction done only then. The same instruction delivered twice
 * must do no harm, so every handler is idempotent.
 *
 * Both sides key registration and dispatch off `MEMBERSHIP_METHODS`, like
 * `SITE_DATA_METHODS` and `RUNTIME_METHODS`.
 */

export const MEMBERSHIP_METHODS = {
  /** A member left a project: their container and home for that project go. */
  memberLeftProject: 'membership.memberLeftProject',
  /** A person left the organisation: the same for every project, and their whole home tree. */
  personLeftOrganisation: 'membership.personLeftOrganisation',
  /** A project was deleted: the project's own home and every member's home for it. */
  projectDeleted: 'membership.projectDeleted',
} as const

export type MembershipMethod = (typeof MEMBERSHIP_METHODS)[keyof typeof MEMBERSHIP_METHODS]

export type MemberLeftProjectParams = {
  instructionId: string
  userId: string
  projectId: string
}

export type PersonLeftOrganisationParams = {
  instructionId: string
  userId: string
}

export type ProjectDeletedParams = {
  instructionId: string
  projectId: string
}

/** One instruction as hq holds and sends it: the method with its params. */
export type MembershipInstruction =
  | { method: typeof MEMBERSHIP_METHODS.memberLeftProject; params: MemberLeftProjectParams }
  | { method: typeof MEMBERSHIP_METHODS.personLeftOrganisation; params: PersonLeftOrganisationParams }
  | { method: typeof MEMBERSHIP_METHODS.projectDeleted; params: ProjectDeletedParams }

/**
 * The site's acknowledgement — the answer to every membership method. Sent only
 * once the site has finished acting on the instruction, including when there
 * was nothing left to do.
 */
export type MembershipAck = {
  instructionId: string
  acknowledged: true
}
