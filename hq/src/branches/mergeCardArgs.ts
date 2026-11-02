/** What a merge card's operation holds (`mergeCard.ts`), and reading it back. No agent is offered a tool of this name. */
export const MERGE_CARD_TOOL = 'merge_branch_into_main'

export const mergeCardKeyPrefix = (branchId: string) => `merge-card:${branchId}:`

export type MergeCardArgs = {
  branchId: string
  workspaceId: string
  branch: string
  main: string
  /** `main`'s head when the card was made: a press merges onto that `main` only. */
  expectedMain: string
  /** The new version's summary. */
  message: string
  agentId: string
  agentName: string
}

export function isMergeCard(toolName: string): boolean {
  return toolName === MERGE_CARD_TOOL
}

const KEYS = ['branchId', 'workspaceId', 'branch', 'main', 'expectedMain', 'message', 'agentId', 'agentName'] as const

export function parseMergeCardArgs(raw: Record<string, unknown> | null): MergeCardArgs | null {
  if (!raw) return null
  for (const k of KEYS) if (typeof raw[k] !== 'string' || !(raw[k] as string)) return null
  return Object.fromEntries(KEYS.map(k => [k, raw[k]])) as MergeCardArgs
}
