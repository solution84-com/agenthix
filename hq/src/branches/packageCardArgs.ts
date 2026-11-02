/**
 * What a package card's operation holds (`packageCard.ts`), and reading it back. No agent is offered a tool of this
 * name: the agent's `ask_to_use_package` reaches hq as the site's `branch.packageBlocked`.
 */
export const PACKAGE_CARD_TOOL = 'allow_package_install_script'

export const packageCardKeyPrefix = (branchId: string, name: string, version: string) => `package-card:${branchId}:${name}@${version}:`

export type PackageCardArgs = {
  branchId: string
  workspaceId: string
  branch: string
  /** The copy the agent asked from, as hq's record names it on the site (`copyId` on the wire). */
  copyId: string
  name: string
  version: string
  /** HQ's question, worded from the registry's facts: the package and its risk in plain words. */
  question: string
  agentName: string
}

export function isPackageCard(toolName: string): boolean {
  return toolName === PACKAGE_CARD_TOOL
}

const KEYS = ['branchId', 'workspaceId', 'branch', 'copyId', 'name', 'version', 'question', 'agentName'] as const

export function parsePackageCardArgs(raw: Record<string, unknown> | null): PackageCardArgs | null {
  if (!raw) return null
  for (const k of KEYS) if (typeof raw[k] !== 'string' || !(raw[k] as string)) return null
  return Object.fromEntries(KEYS.map(k => [k, raw[k]])) as PackageCardArgs
}
