import { isPackageRef, type RunPackages } from '@agenthix/core'
import { resolvePackage } from './packageCache'

export type ResolvedRunPackages = { refs: RunPackages; agentDir: string; orgDir: string | null; platformDir: string }

/** The cached files of exactly the content hq dispatched. Throws PackageUnavailableError for any it lacks (P9). */
export async function resolveRunPackageDirs(packages: RunPackages): Promise<ResolvedRunPackages> {
  const agentDir = await resolvePackage(packages.agent)
  const orgDir = packages.org ? await resolvePackage(packages.org) : null
  const platformDir = await resolvePackage(packages.platform)
  return { refs: packages, agentDir, orgDir, platformDir }
}

/** The most skill digests one run records; the dispatch's own bound on each list (runSkillInputs.ts). */
const MAX_SKILL_DIGESTS = 1000

/** What the dispatch named beside its packages, as it arrived: checked here, entry by entry. */
export type DispatchedSkills = { installedSkills?: unknown; personSkills?: unknown }

/**
 * The installed and personal skill content a run was dispatched with, each digest once: what eviction leaves while
 * the run is queued or running, so a run never finds its skills gone from the cache (security review L4).
 */
export function dispatchedSkillDigests(skills: DispatchedSkills | null | undefined): string[] {
  const digests = new Set<string>()
  for (const list of [skills?.installedSkills, skills?.personSkills]) {
    if (!Array.isArray(list)) continue
    for (const entry of list) {
      const ref = (entry as { ref?: unknown } | null)?.ref
      if (isPackageRef(ref) && ref.kind === 'skill' && digests.size < MAX_SKILL_DIGESTS) digests.add(ref.digest)
    }
  }
  return [...digests]
}

/** The digests a run's AgentRun row records — what the run used, by content (ADR-0072), its skills' included. */
export function runPackageColumns(packages: RunPackages, skills?: DispatchedSkills | null) {
  return {
    agentPackageDigest: packages.agent.digest,
    orgPackageDigest: packages.org?.digest ?? null,
    platformPackageDigest: packages.platform.digest,
    skillDigests: dispatchedSkillDigests(skills),
  }
}
