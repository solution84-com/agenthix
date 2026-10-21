/**
 * What the permissions view reads, as the operations answer: the organisation's own (getAgentPermissions) and a
 * project's or a person's beside it (getAgentPermissionsHere). The server types live in hq.
 */
export type ToolState = 'always' | 'ask' | 'never'
export type ToolGroupId = 'files' | 'commands' | 'web' | 'platform'
export type ApprovalId = 'bypassed' | 'deferred' | 'immediate'

export type OrganisationPermissionsData = {
  approval: string
  tools: { name: string; group: ToolGroupId; fixed: boolean; state: ToolState }[]
  bashPatterns: { pattern: string; state: ToolState }[]
}

export type NarrowedLineData = { organisation: ToolState; here: ToolState | null; effective: ToolState; narrowed: boolean }

export type PermissionsHereData = {
  approval: { organisation: string; here: string | null; effective: string; narrowed: boolean }
  organisationBypassed: boolean
  tools: ({ name: string; group: ToolGroupId; fixed: boolean } & NarrowedLineData)[]
  bashPatterns: ({ pattern: string } & NarrowedLineData)[]
  narrowedCount: number
}

/** What a save sends: the whole of this level's permissions. A narrowing sends null for what it leaves to the organisation. */
export type PermissionsSave = {
  approval: string | null
  allowedTools: { name: string; state: ToolState }[] | null
  allowedBashPatterns: { pattern: string; state: ToolState }[] | null
}
