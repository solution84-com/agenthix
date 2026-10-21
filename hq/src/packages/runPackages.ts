import { prisma } from 'wasp/server'
import { PLATFORM_PACKAGE_KEY, type PackageKind, type RunPackages } from '@agenthix/core'
import { getCurrentPackage } from './packageStore'

export class AgentPackageMissingError extends Error {
  constructor(agentId: string) {
    super(`Agent ${agentId} has no instructions yet — save its instructions before running it`)
    this.name = 'AgentPackageMissingError'
  }
}

/**
 * A system package (platform, and org once one exists) that hq itself is
 * responsible for writing but hasn't yet — never a person's doing (unlike
 * `AgentPackageMissingError`), so distinguished from it for a clearer 409.
 * Org has no such case today (no org package before an org exists is the
 * expected state — resolveRunPackages returns `org: null`); kept generic over
 * `kind` so this stays true if that ever changes.
 */
export class SystemPackageMissingError extends Error {
  constructor(readonly kind: PackageKind, key: string) {
    super(`The ${kind} package ${key} has not been written yet — hq writes it automatically at boot`)
    this.name = 'SystemPackageMissingError'
  }
}

/** The content a run started now loads: each package's current content, named by digest (ADR-0072). */
export async function resolveRunPackages(agentId: string): Promise<RunPackages> {
  const org = await prisma.org.findFirst({ select: { id: true } })
  const [agent, orgPackage, platform] = await Promise.all([
    getCurrentPackage('agent', agentId),
    org ? getCurrentPackage('org', org.id) : Promise.resolve(null),
    getCurrentPackage('platform', PLATFORM_PACKAGE_KEY),
  ])
  if (!agent) throw new AgentPackageMissingError(agentId)
  if (!platform) throw new SystemPackageMissingError('platform', PLATFORM_PACKAGE_KEY)
  return { agent: agent.ref, org: orgPackage?.ref ?? null, platform: platform.ref }
}
