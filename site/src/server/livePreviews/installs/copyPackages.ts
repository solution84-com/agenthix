/**
 * A person's yes, from the card in a branch's task thread or conversation, to one blocked package's install script on
 * that branch (`branch.packageUse`, adr-0170). The site checks the workspace is one it holds, and that an agent asked
 * about exactly that package version on that workspace's branch here; anything else is refused and changes nothing.
 * The yes is kept for the branch, not the copy that asked: the run that asked may have ended and its copy gone by the
 * time a person answers, and the next `install_packages` in any copy of the branch then runs its script.
 */
import { parseBranchPackageUseParams, type BranchPackageUseResult } from '@agenthix/core'
import { placeWorkspace } from '../../branches/branchCalls'
import { acceptPackageUse, branchKey } from './packages'

const METHOD = 'branch.packageUse'

export async function branchPackageUse(params: unknown): Promise<BranchPackageUseResult> {
  const p = parseBranchPackageUseParams(params)
  if (!p) return { ok: false, refusal: { code: 'malformed' } }
  try {
    await placeWorkspace(p.workspace, METHOD)
  } catch {
    return { ok: false, refusal: { code: 'noCopy' } }
  }
  return acceptPackageUse(branchKey(p.workspace.workspaceId, p.branch), p.package) ? { ok: true } : { ok: false, refusal: { code: 'noPackage' } }
}
