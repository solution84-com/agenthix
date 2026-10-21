// ── Tool permission types ─────────────────────────────────────────────────────

/**
 * Three-state permission model for tools and bash patterns.
 *
 * always — executes immediately, no HITL gate.
 * ask    — visible to Claude; calling it triggers HITL manifest approval.
 * never  — invisible to Claude; removed from SDK context via disallowedTools.
 */
export type ToolPermissionState = 'always' | 'ask' | 'never'

export interface ToolPermission {
  name: string
  state: ToolPermissionState
  [key: string]: string  // index signature — makes the type JSON-serializable (SuperJSONObject compat)
}

export interface BashPatternPermission {
  pattern: string
  state: ToolPermissionState
  [key: string]: string  // index signature — makes the type JSON-serializable (SuperJSONObject compat)
}
