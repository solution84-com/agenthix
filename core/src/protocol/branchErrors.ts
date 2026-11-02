/**
 * How a branch method (`branchWork.ts`, `branchReads.ts`, `mainWork.ts`) refuses. Two vocabularies cross for them:
 * what any Git command on a site can meet (a location that cannot be placed, no `git`, the budget run out, git
 * failing, a shape the method does not take) is a `RepoWorkError`, as for `repo.connect` and `git.status`; what only
 * branches and copies can meet is a `BranchWorkError`, below. Its own marker, so neither decoder hands a caller a code
 * from a list it is not checking against. Neither names a path on the site's disk or carries git's own output.
 */

export const BRANCH_WORK_ERROR_CODES = [
  /** The workspace's folder is not a Git repository: Git is not on for it. */
  'not_repository',
  /** Turning Git on for a folder that already is a repository. */
  'already_repository',
  /** Making, or renaming to, a branch the repository already has. */
  'branch_exists',
  /** The branch, commit or version named is not in the repository. */
  'not_found',
  /** The call names the workspace's `main` where only another branch may be named. */
  'is_main',
  /** No copy with that id, or not one of that workspace and branch by the site's own record. */
  'no_copy',
  /** Making a copy with an id already in use. */
  'copy_exists',
] as const

export type BranchWorkErrorCode = (typeof BRANCH_WORK_ERROR_CODES)[number]

export const BRANCH_WORK_ERROR_MARKER = 'branch-work/'

const ENCODED_ERROR = /^([a-z_]+): ([\s\S]*)$/

export function encodeBranchWorkError(code: BranchWorkErrorCode, detail: string): string {
  return `${BRANCH_WORK_ERROR_MARKER}${code}: ${detail}`
}

/** Null for anything that is not one of ours: the marker must be there and the code behind it a published one. */
export function decodeBranchWorkError(wire: string): { code: BranchWorkErrorCode; message: string } | null {
  if (typeof wire !== 'string' || !wire.startsWith(BRANCH_WORK_ERROR_MARKER)) return null
  const match = ENCODED_ERROR.exec(wire.slice(BRANCH_WORK_ERROR_MARKER.length))
  if (!match) return null
  const code = match[1] as BranchWorkErrorCode
  if (!(BRANCH_WORK_ERROR_CODES as readonly string[]).includes(code)) return null
  return { code, message: match[2] }
}

export class BranchWorkError extends Error {
  constructor(readonly code: BranchWorkErrorCode, readonly detail: string) {
    super(encodeBranchWorkError(code, detail))
    this.name = 'BranchWorkError'
  }

  static fromWire(wire: string): BranchWorkError | null {
    const decoded = decodeBranchWorkError(wire)
    return decoded ? new BranchWorkError(decoded.code, decoded.message) : null
  }
}
