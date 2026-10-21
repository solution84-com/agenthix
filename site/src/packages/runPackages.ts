import type { RunPackages } from '@agenthix/core'
import { resolvePackage } from './packageCache'

export type ResolvedRunPackages = { refs: RunPackages; agentDir: string; orgDir: string | null; platformDir: string }

/** The cached files of exactly the content hq dispatched. Throws PackageUnavailableError for any it lacks (P9). */
export async function resolveRunPackageDirs(packages: RunPackages): Promise<ResolvedRunPackages> {
  const agentDir = await resolvePackage(packages.agent)
  const orgDir = packages.org ? await resolvePackage(packages.org) : null
  const platformDir = await resolvePackage(packages.platform)
  return { refs: packages, agentDir, orgDir, platformDir }
}

/** The digests a run's AgentRun row records — what the run used, by content (ADR-0072). */
export function runPackageColumns(packages: RunPackages) {
  return {
    agentPackageDigest: packages.agent.digest,
    orgPackageDigest: packages.org?.digest ?? null,
    platformPackageDigest: packages.platform.digest,
  }
}
