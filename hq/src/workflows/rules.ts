/**
 * The library's rules as plain decisions over facts (workflows spec part 1, *A version*, *On and off*, *R4 · Who
 * approves*, *A version's life*): `approve.ts` and `switch.ts` gather the facts from the database and ask here, so
 * every rule is tested without one. Each refusal says what is wrong, who can act, and that nothing was changed.
 */
import { OWN_STORAGE_GITHUB_PERMISSIONS, permissionsBeyond, type GitHubPermissions } from '@agenthix/core'
import type { WorkspaceOwnerType } from '@prisma/client'

export type Decision = { ok: true } | { ok: false; status: number; message: string }

const ok: Decision = { ok: true }
const no = (status: number, message: string): Decision => ({ ok: false, status, message })

export type VersionState = 'PROPOSED' | 'APPROVED' | 'DECLINED' | 'SUPERSEDED'

/** GitHub permissions a version declares beyond what a person may approve in their own storage. */
export function beyondOwnStorageLimit(github: GitHubPermissions): string[] {
  const limit: GitHubPermissions = Object.fromEntries(OWN_STORAGE_GITHUB_PERMISSIONS.map((p) => [p, 'write']))
  return Object.keys(permissionsBeyond(github, limit)).sort()
}

export type ApproverFacts = {
  placeType: WorkspaceOwnerType
  /** The person administers the place (placeAccess.ts). */
  administers: boolean
  isOrgAdmin: boolean
  github: GitHubPermissions
}

/**
 * Who may approve or decline: the place's administrators. In a person's own storage, a GitHub permission beyond
 * contents and pull requests also needs an organisation administrator, so there the person must be one.
 */
export function mayDecideVersion(f: ApproverFacts, what: 'approve' | 'decline'): Decision {
  if (!f.administers) {
    const who = f.placeType === 'user' ? 'the person whose storage this is' : 'one of this project\'s administrators'
    return no(403, `Only ${who} can ${what} this workflow; ask them. Nothing was changed.`)
  }
  if (what === 'approve' && f.placeType === 'user' && !f.isOrgAdmin) {
    const beyond = beyondOwnStorageLimit(f.github)
    if (beyond.length) {
      return no(403,
        `This version asks for GitHub permissions beyond contents and pull requests (${beyond.join(', ')}), which ` +
        'in your own storage need an organisation administrator. Ask one, or narrow the workflow\'s github: ' +
        'permissions and propose it again. Nothing was changed.')
    }
  }
  return ok
}

export type VersionFacts = {
  state: VersionState
  number: number
  hash: string
  /** The plain checks have run (3c); until they have, a person isn't shown what they would approve. */
  checked: boolean
  /** The card may offer Approve (R1); only asked for an approval from the card. */
  cardMayApprove: boolean | null
}

/**
 * Approving one version, named by its hash. The hash given must be the version's own, since a person approves
 * what they were shown; it must still be waiting; and it may not be older than the approved one.
 */
export function mayApproveVersion(
  v: VersionFacts, givenHash: string, approvedNumber: number | null, via: 'review' | 'card',
): Decision {
  if (givenHash !== v.hash) return no(409, 'This version has changed since you opened it. Open it again to see what it is now. Nothing was changed.')
  if (v.state === 'APPROVED') return no(409, `Version ${v.number} is already approved. Nothing was changed.`)
  if (v.state === 'DECLINED') return no(409, `Version ${v.number} was declined; the agent can propose a new one. Nothing was changed.`)
  if (v.state === 'SUPERSEDED') return no(409, `Version ${v.number} was replaced by a newer version. Nothing was changed.`)
  if (approvedNumber !== null && v.number < approvedNumber) {
    return no(409, `Version ${v.number} is older than the approved version ${approvedNumber}. Nothing was changed.`)
  }
  if (!v.checked) return no(409, `Version ${v.number} is still being checked; try again in a moment. Nothing was changed.`)
  if (via === 'card' && v.cardMayApprove !== true) {
    return no(409, `Version ${v.number} needs the full review before it can be approved. Nothing was changed.`)
  }
  return ok
}

export function mayDeclineVersion(v: VersionFacts, givenHash: string): Decision {
  if (givenHash !== v.hash) return no(409, 'This version has changed since you opened it. Open it again to see what it is now. Nothing was changed.')
  if (v.state !== 'PROPOSED') return no(409, `Version ${v.number} isn't waiting for a decision. Nothing was changed.`)
  return ok
}

/** What approving a version does to the workflow's other versions and its switch. */
export function afterApproval(
  approvedNumber: number,
  others: { id: string; number: number; state: VersionState }[],
  everApproved: boolean,
): { supersede: string[]; turnOn: boolean } {
  const supersede = others
    .filter((o) => o.state === 'APPROVED' || (o.state === 'PROPOSED' && o.number < approvedNumber))
    .map((o) => o.id)
  // A workflow is on when its first version is approved; a later approval leaves the switch where a person put it.
  return { supersede, turnOn: !everApproved }
}

/** Turning a workflow on or off. On needs an approved version, and no new approval. */
export function maySwitch(enabled: boolean, hasApproved: boolean): Decision {
  if (enabled && !hasApproved) {
    return no(409, 'This workflow has no approved version yet: approve one and it turns on. Nothing was changed.')
  }
  return ok
}
