/**
 * What a site's refusal of branch work means to the person who asked, and to an agent's tool call. A `BranchWorkError`
 * is said in words a person can act on; a `RepoWorkError` and an unreachable site keep the mapping every repository
 * call has (`storage/httpErrors.ts`).
 */
import { HttpError } from 'wasp/server'
import { BranchWorkError, RepoWorkError, type BranchWorkErrorCode } from '@agenthix/core'
import { rethrowRepoWorkErrorAsHttp } from '../storage/httpErrors'
import { SiteUnreachableError } from '../storage/workspaceStore'
import { ControlPlaneError, type ControlPlaneErrorCode } from '../server/controlplane/types'

/** Typed by the code list, so a code added to core fails to compile here until it has a status and words. */
const BRANCH_WORK_REFUSAL: Record<BranchWorkErrorCode, { status: number; words: string }> = {
  not_repository: { status: 409, words: "This workspace isn't a Git repository yet. A Member or Admin can turn Git on for it. Nothing was changed." },
  already_repository: { status: 409, words: 'This workspace is already a Git repository. Nothing was changed.' },
  branch_exists: { status: 409, words: 'The repository already has a branch with that name. Choose another name. Nothing was changed.' },
  not_found: { status: 404, words: "That branch or version isn't in the workspace's repository any more. Reload to see where it stands. Nothing was changed." },
  is_main: { status: 400, words: 'That names main, which only a merge or a restore changes. Nothing was changed.' },
  no_copy: { status: 409, words: "This branch's working copy isn't on its site any more. It is made again when its work next runs. Nothing was changed." },
  copy_exists: { status: 409, words: 'That working copy already exists on the site. Try again. Nothing was changed.' },
}

export function branchRefusalWords(code: BranchWorkErrorCode): string {
  return BRANCH_WORK_REFUSAL[code].words
}

/** The boundary every branch operation reaches: a coded refusal in words, an unreachable site as 503. */
export function rethrowBranchWorkAsHttp(err: unknown): never {
  if (err instanceof HttpError) throw err
  if (err instanceof BranchWorkError) {
    const r = BRANCH_WORK_REFUSAL[err.code]
    throw new HttpError(r.status, r.words)
  }
  if (err instanceof RepoWorkError || err instanceof SiteUnreachableError) rethrowRepoWorkErrorAsHttp(err)
  throw err
}

/** Runs an operation's body and gives every refusal as the HTTP status it is. */
export async function asBranchHttp<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work()
  } catch (err) {
    rethrowBranchWorkAsHttp(err)
  }
}

const TOOL_CODE: Record<number, ControlPlaneErrorCode> = { 400: 'invalid', 403: 'forbidden', 404: 'not_found', 409: 'conflict', 503: 'unavailable' }

/** The same refusals, for an agent's tool call: the words reach the agent as they are. */
export async function asBranchTool<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work()
  } catch (err) {
    if (err instanceof ControlPlaneError) throw err
    const http = toHttp(err)
    if (!http) throw err
    throw new ControlPlaneError(TOOL_CODE[http.statusCode] ?? 'conflict', http.message)
  }
}

function toHttp(err: unknown): HttpError | null {
  try {
    rethrowBranchWorkAsHttp(err)
  } catch (mapped) {
    return mapped instanceof HttpError ? mapped : null
  }
}
