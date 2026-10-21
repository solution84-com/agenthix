// Mirrors the server rule in hq/src/agents/agentHandle.ts (which refuses
// anything else): lowercase letters, digits, `_` and `-`, starting with a
// letter or digit, at most 64 characters. Keep the two in step; hq's
// createFormHandleAgreement test checks them against each other.
const AGENT_HANDLE_MAX_LENGTH = 64

export function sanitizeHandle(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '')
    .replace(/^[-_]+/, '')
    .slice(0, AGENT_HANDLE_MAX_LENGTH)
}
