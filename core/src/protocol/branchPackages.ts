/**
 * Install scripts in a branch's copy with no live preview open (adr-0170), as hq and the site say them on the control
 * channel. Every code-work run installs with scripts off and is offered `install_packages`,
 * which runs the scripts of packages that pass the rule in the run's own container. A package the rule blocks is asked
 * about only when the agent finds no other: the site says `branch.packageBlocked`, hq puts a card in the branch's task
 * thread or conversation for a Member or Admin, and their yes is `branch.packageUse`. With a live preview open, the
 * live preview's strip asks instead (`livePreview.packageBlocked`, `package.use`).
 */
import { isNpmPackageName } from '../livePreview/installScripts.js'
import type { InstallScriptVerdict, PackageFacts } from '../livePreview/installScripts.js'
import { isCopyId, isGitBranchName } from './gitNames.js'
import { WORKSPACE_OWNER_TYPES } from './siteData.js'
import type { WorkspaceRepoRef } from './branchWork.js'

export const BRANCH_PACKAGE_BLOCKED_EVENT = 'branch.packageBlocked'
export const BRANCH_PACKAGE_USE_METHOD = 'branch.packageUse'

/** One package's version, named exactly; only npm's registry is checked by the rule. */
export type BlockedPackageRef = { ecosystem: 'npm'; name: string; version: string }

/**
 * site → hq when the agent of a run in a branch's copy asks a person about a package whose install script the rule
 * blocked. `question` is core's `installScriptQuestion`; hq words its card from the facts itself.
 */
export type BranchPackageBlockedEvent = {
  workspace: WorkspaceRepoRef
  copyId: string
  branch: string
  runId: string
  package: BlockedPackageRef
  verdict: InstallScriptVerdict
  facts: PackageFacts | null
  question: string
  at: string
}

/**
 * hq → the workspace's site: a person's yes, from the card, to that one package version's install script on that
 * branch. The site keeps it for the workspace's branch, not the copy that asked, so it holds after that copy is removed
 * and applies to the branch's later copies.
 */
export type BranchPackageUseParams = {
  workspace: WorkspaceRepoRef
  /** The copy that asked, as the card recorded it; it may be gone by the time the person answers. */
  copyId: string
  branch: string
  personId: string
  package: BlockedPackageRef
}

/**
 * - malformed: the params are not their shape.
 * - noCopy: this site does not hold that workspace.
 * - noPackage: no agent asked about that package version on that branch here, or it was answered already.
 */
export const BRANCH_PACKAGE_REFUSALS = ['malformed', 'noCopy', 'noPackage'] as const
export type BranchPackageRefusalCode = (typeof BRANCH_PACKAGE_REFUSALS)[number]
export type BranchPackageUseResult = { ok: true } | { ok: false; refusal: { code: BranchPackageRefusalCode } }

const ID = /^[A-Za-z0-9_-]{1,64}$/
const VERSION = /^[0-9A-Za-z.+-]{1,64}$/

function closed(v: unknown, keys: readonly string[]): Record<string, unknown> | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null
  const d = v as Record<string, unknown>
  return Object.keys(d).length === keys.length && keys.every(k => Object.prototype.hasOwnProperty.call(d, k)) ? d : null
}

function workspaceRef(v: unknown): WorkspaceRepoRef | null {
  const d = closed(v, ['ownerType', 'ownerId', 'workspaceId'])
  if (!d || typeof d.ownerId !== 'string' || !ID.test(d.ownerId) || typeof d.workspaceId !== 'string' || !ID.test(d.workspaceId)) return null
  if (!(WORKSPACE_OWNER_TYPES as readonly unknown[]).includes(d.ownerType)) return null
  return { ownerType: d.ownerType as WorkspaceRepoRef['ownerType'], ownerId: d.ownerId, workspaceId: d.workspaceId }
}

/** A package as it came off the wire: npm, a registry name and an exact version; null for anything else. */
export function parseBlockedPackageRef(v: unknown): BlockedPackageRef | null {
  const d = closed(v, ['ecosystem', 'name', 'version'])
  if (!d || d.ecosystem !== 'npm' || !isNpmPackageName(d.name) || typeof d.version !== 'string' || !VERSION.test(d.version)) return null
  return { ecosystem: 'npm', name: d.name, version: d.version }
}

export function parseBranchPackageUseParams(v: unknown): BranchPackageUseParams | null {
  const d = closed(v, ['workspace', 'copyId', 'branch', 'personId', 'package'])
  if (!d) return null
  const workspace = workspaceRef(d.workspace)
  const pkg = parseBlockedPackageRef(d.package)
  if (!workspace || !pkg || !isCopyId(d.copyId) || !isGitBranchName(d.branch)) return null
  if (typeof d.personId !== 'string' || !ID.test(d.personId)) return null
  return { workspace, copyId: d.copyId, branch: d.branch, personId: d.personId, package: pkg }
}
