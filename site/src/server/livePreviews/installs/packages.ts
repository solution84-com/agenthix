/**
 * What the site remembers about blocked packages (adr-0170), for each place an install runs: a live preview, or a
 * branch's copy with no live preview open (keyed `copyKey`). The packages the rule blocked there, the ones the agent
 * asked a person about, and the ones a person then allowed in HQ (`package.use` from the live preview's strip,
 * `branch.packageUse` from the card in the branch's thread). A question from a copy is kept for its branch too
 * (`branchKey`), and the card's yes, and the live preview strip's, is kept there: it holds after the run that asked ended and its copy was removed, and
 * applies to every later copy of the branch and to its live preview on this site. Held in memory: a live preview's is
 * dropped when it stops, the oldest place's when too many are held, and a restart of the site forgets it all, and the
 * agent asks again. A person is asked only when the agent asks, after it found no other package; a yes for a package
 * nobody asked about is refused.
 */
import {
  BRANCH_PACKAGE_BLOCKED_EVENT, LIVE_PREVIEW_APP_EVENTS, packageFactsKey,
  type BranchPackageBlockedEvent, type InstallScriptVerdict, type LivePreviewPackageBlockedEvent,
  type PackageFacts, type WorkspaceRepoRef,
} from '@agenthix/core'

export type BlockedPackage = { name: string; version: string; verdict: InstallScriptVerdict; facts: PackageFacts | null; question: string }

type Held = { blocked: Map<string, BlockedPackage>; asked: Set<string>; allowed: Set<string> }

const MAX_PER_PREVIEW = 500
const MAX_PLACES = 1000
const previews = new Map<string, Held>()
let tell: (event: LivePreviewPackageBlockedEvent) => void = () => {}
let tellCopy: (event: BranchPackageBlockedEvent) => void = () => {}

export function setPackageBlockedTeller(next: (event: LivePreviewPackageBlockedEvent) => void): void {
  tell = next
}

export function setCopyPackageBlockedTeller(next: (event: BranchPackageBlockedEvent) => void): void {
  tellCopy = next
}

export const PACKAGE_BLOCKED_EVENT = LIVE_PREVIEW_APP_EVENTS.packageBlocked
export const COPY_PACKAGE_BLOCKED_EVENT = BRANCH_PACKAGE_BLOCKED_EVENT

/** The key an install in a branch's copy with no live preview is remembered by; never a live preview's id. */
export const copyKey = (copyId: string): string => `copy:${copyId}`

/** The key a branch's questions and yeses are kept by, whichever of its copies asked. */
export const branchKey = (workspaceId: string, branch: string): string => `branch:${workspaceId}\u0000${branch}`

const keyOf = (name: string, version: string) => packageFactsKey('npm', name, version)

function of(id: string): Held {
  let held = previews.get(id)
  if (!held) {
    if (previews.size >= MAX_PLACES) previews.delete(previews.keys().next().value as string)
    previews.set(id, (held = { blocked: new Map(), asked: new Set(), allowed: new Set() }))
  }
  return held
}

export function recordBlocked(id: string, pkg: BlockedPackage): void {
  const held = of(id)
  if (held.blocked.size >= MAX_PER_PREVIEW) held.blocked.delete(held.blocked.keys().next().value as string)
  held.blocked.set(keyOf(pkg.name, pkg.version), pkg)
}

export function personAllowed(id: string, name: string, version: string): boolean {
  return previews.get(id)?.allowed.has(keyOf(name, version)) ?? false
}

function markAsked(id: string, name: string, version: string): BlockedPackage | null {
  const held = previews.get(id)
  const key = keyOf(name, version)
  const blocked = held?.blocked.get(key)
  if (!held || !blocked) return null
  held.asked.add(key)
  return blocked
}

/** The agent found no other package: a person is asked, through hq. Null when the rule did not block that version here. */
export function askPerson(id: string, runId: string | null, name: string, version: string, now = new Date()): BlockedPackage | null {
  const blocked = markAsked(id, name, version)
  if (!blocked) return null
  tell({
    livePreviewId: id, runId, package: { ecosystem: 'npm', name, version },
    verdict: blocked.verdict, facts: blocked.facts, question: blocked.question, at: now.toISOString(),
  })
  return blocked
}

export type CopyPlace = { workspace: WorkspaceRepoRef; copyId: string; branch: string }

/** As `askPerson`, for a branch's copy with no live preview: hq asks in the branch's task thread or conversation. */
export function askPersonInCopy(copy: CopyPlace, runId: string, name: string, version: string, now = new Date()): BlockedPackage | null {
  const blocked = markAsked(copyKey(copy.copyId), name, version)
  if (!blocked) return null
  of(branchKey(copy.workspace.workspaceId, copy.branch)).asked.add(keyOf(name, version))
  tellCopy({
    workspace: copy.workspace, copyId: copy.copyId, branch: copy.branch, runId, package: { ecosystem: 'npm', name, version },
    verdict: blocked.verdict, facts: blocked.facts, question: blocked.question, at: now.toISOString(),
  })
  return blocked
}

/**
 * A person's yes in HQ; false when nobody was asked about that package in this place (a live preview, or a branch).
 * `alsoFor` is the branch's key (`branchKey`) when the place is a live preview: the yes is kept there too.
 */
export function acceptPackageUse(id: string, pkg: { ecosystem: string; name: string; version: string }, alsoFor?: string): boolean {
  const held = previews.get(id)
  const key = keyOf(pkg.name, pkg.version)
  if (pkg.ecosystem !== 'npm' || !held?.asked.has(key)) return false
  held.asked.delete(key)
  held.allowed.add(key)
  if (alsoFor !== undefined && alsoFor !== id) of(alsoFor).allowed.add(key)
  return true
}

export function forgetPackages(id: string): void {
  previews.delete(id)
}
