/**
 * Shaping an agent is the organisation admin's: its name, handle, role
 * and behaviour (R-195). Nothing in a save is open to anyone
 * else, so a non-admin's save is refused up front, before either action is
 * called — never a partial save (identity written, settings 403).
 *
 * For an admin, ConfigurationTab and PermissionsTab always send every behaviour
 * field they own on save, whether or not it actually changed — so the save
 * handler can't decide "this is a settings change" from "a behaviour field was present
 * in the input" alone; it has to compare each one against the agent's current
 * value. A save that only resubmits the current values changes no setting.
 */
import { coerceToolPermissions, coerceBashPatternPermissions } from '../toolPermissions'

export type AgentBehaviourFields = {
  defaultModel?: string
  runtime?: string
  approval?: string
  allowedTools?: unknown
  allowedBashPatterns?: unknown
}

const BEHAVIOUR_KEYS = ['defaultModel', 'runtime', 'approval', 'allowedTools', 'allowedBashPatterns'] as const

/**
 * One shape for both sides of the comparison: a legacy `string[]` becomes the
 * permission objects it means, and no bash patterns is `null` whether it was
 * stored as `null` or sent as `[]`.
 */
function normalised(key: (typeof BEHAVIOUR_KEYS)[number], value: unknown): unknown {
  if (key === 'allowedTools') return Array.isArray(value) ? coerceToolPermissions(value) : value ?? null
  if (key === 'allowedBashPatterns') {
    const patterns = Array.isArray(value) ? coerceBashPatternPermissions(value) : null
    return patterns && patterns.length > 0 ? patterns : null
  }
  return value
}

function differs(key: (typeof BEHAVIOUR_KEYS)[number], a: unknown, b: unknown): boolean {
  if (a === b) return false
  return JSON.stringify(normalised(key, a)) !== JSON.stringify(normalised(key, b))
}

/** Only the behaviour fields whose submitted value actually differs from the agent's current one. */
export function realBehaviourChanges(
  incoming: AgentBehaviourFields,
  current: AgentBehaviourFields,
): Partial<AgentBehaviourFields> {
  const change: Partial<AgentBehaviourFields> = {}
  for (const key of BEHAVIOUR_KEYS) {
    const value = incoming[key]
    if (value === undefined) continue
    if (differs(key, value, current[key])) (change as Record<string, unknown>)[key] = value
  }
  return change
}

export type AgentSaveDecision =
  | { kind: 'identity-only' }
  | { kind: 'save'; change: Partial<AgentBehaviourFields> }
  | { kind: 'refused'; message: string }

export const AGENT_SAVE_REFUSAL_MESSAGE =
  "Changing an agent requires the ADMIN role. Ask an organisation admin to make this change."

/**
 * What a save may do. For an admin, the identity field (name)
 * always goes through — the caller applies those separately — and the decision
 * says whether settings are saved as well. Anyone else is refused whole.
 */
export function resolveAgentSave(
  incoming: AgentBehaviourFields,
  current: AgentBehaviourFields,
  isOrgAdmin: boolean,
): AgentSaveDecision {
  if (!isOrgAdmin) return { kind: 'refused', message: AGENT_SAVE_REFUSAL_MESSAGE }
  const change = realBehaviourChanges(incoming, current)
  if (Object.keys(change).length === 0) return { kind: 'identity-only' }
  return { kind: 'save', change }
}

export type VoiceSaveDecision = { kind: 'ok' } | { kind: 'refused'; message: string }

export const AGENT_VOICE_SAVE_REFUSAL_MESSAGE =
  "Changing an agent's voice requires the ADMIN role. Ask an organisation admin to make this change."

/**
 * updateAgentVoice has no identity-only subset like the behaviour fields do —
 * every call is an org-admin act (server floor: ADMIN, agentVoiceActions.ts) —
 * so there is no diff to take, only the admin check. Same shape as
 * resolveAgentSave otherwise: the page reads role fresh at save time and
 * refuses here, before the network call, rather than let the Voice tab's
 * control — which stays visible and usable for reading current settings —
 * round-trip into a 403.
 */
export function resolveVoiceSave(isOrgAdmin: boolean): VoiceSaveDecision {
  return isOrgAdmin ? { kind: 'ok' } : { kind: 'refused', message: AGENT_VOICE_SAVE_REFUSAL_MESSAGE }
}
