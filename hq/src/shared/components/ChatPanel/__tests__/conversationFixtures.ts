let n = 0
const base = {
  thought: null, thinkingDurationMs: null, toolName: null, toolInput: null, toolOutput: null, model: null, usage: null,
  authorName: null, runId: null, kind: null, detail: null, runStatus: null,
}
const at = (minute: number) => new Date(2026, 9, 10, 10, minute).toISOString()

export const user = (content: string, minute: number, extra: Record<string, unknown> = {}) =>
  ({ ...base, id: `u${++n}`, role: 'USER', content, createdAt: at(minute), authorName: 'Avery', ...extra })
export const reply = (content: string, minute: number, extra: Record<string, unknown> = {}) =>
  ({ ...base, id: `a${++n}`, role: 'ASSISTANT', content, createdAt: at(minute), model: 'claude-sonnet-4-6',
    usage: { inputTokens: 18_600, outputTokens: 169, cacheReadTokens: 0, cacheWriteTokens: 0, totalTokens: 18_769 }, ...extra })
export const tool = (name: string, input: unknown, minute: number, extra: Record<string, unknown> = {}) =>
  ({ ...base, id: `t${++n}`, role: 'TOOL', content: '', toolName: name, toolInput: input, toolOutput: 'ok', createdAt: at(minute), ...extra })
export const system = (kind: string, minute: number, extra: Record<string, unknown> = {}) =>
  ({ ...base, id: `s${++n}`, role: 'SYSTEM', content: '', kind, createdAt: at(minute), ...extra })

export const session = (entries: unknown[], extra: Record<string, unknown> = {}) => ({
  id: 's1', agentId: 'agent-1', title: 'Project UX redesign', status: 'ACTIVE', closedReason: null, model: 'claude-sonnet-4-6',
  createdAt: at(24), totalInputTokens: 97_000, totalOutputTokens: 100, totalCacheReadTokens: 0, totalCacheWriteTokens: 0,
  metadata: null, primaryLocation: null,
  agent: { id: 'agent-1', name: 'Project manager', avatarUrl: null },
  entries,
  conversation: { replies: 14, failed: 1, latestFailure: null, contextUse: null },
  ...extra,
})
