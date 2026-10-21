/**
 * Agent handles
 * =============
 * A handle names the agent's folder on a site's disk and is how people
 * @mention it, so it is a single lowercase path segment. The rule admits every
 * handle hq produces: the create form's (lowercase letters, digits, `_` and `-`),
 * generateHandle's, and the bundled templates'. It is checked in agentService,
 * where every create and rename lands (spec §4.27).
 *
 * Pure — no server imports.
 */

export const AGENT_HANDLE_MAX_LENGTH = 64

const AGENT_HANDLE_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/

export const INVALID_AGENT_HANDLE_MESSAGE =
  'A handle is 1 to 64 lowercase letters, digits, hyphens or underscores, starting with a letter or digit'

export function isValidAgentHandle(handle: unknown): handle is string {
  return typeof handle === 'string' && AGENT_HANDLE_RE.test(handle)
}
