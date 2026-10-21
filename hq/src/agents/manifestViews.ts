/** What the tool-call and request reads answer, built field by field from the site's rows (manifestQueries.ts). */
import type { JsonValue, PendingManifestView, RunRow, ToolCallRow, ToolCallView } from '@agenthix/core'

export function toolCallView(row: ToolCallRow): ToolCallView {
  return {
    id: row.id,
    runId: row.runId,
    toolName: row.toolName,
    // The site sends its rows as JSON, so the input is JSON already.
    toolInput: (row.toolInput ?? null) as JsonValue,
    toolUseId: row.toolUseId,
    riskLevel: row.riskLevel,
    blocked: row.blocked,
    blockReason: row.blockReason,
    createdAt: row.createdAt,
  }
}

type Requested = PendingManifestView['pendingManifest']

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const listOf = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? v.filter(isRecord) : [])
const reasonOf = (item: Record<string, unknown>) => (typeof item.reason === 'string' ? { reason: item.reason } : {})

/** The run's request as a person answers it: each tool by name and each command by its pattern, with the agent's reason. */
export function pendingManifestView(run: Pick<RunRow, 'id' | 'sessionId' | 'pendingManifest'>): PendingManifestView {
  const manifest: Record<string, unknown> = isRecord(run.pendingManifest) ? run.pendingManifest : {}
  const pendingManifest: Requested = {
    tools: listOf(manifest.tools).flatMap(t => (typeof t.name === 'string' ? [{ name: t.name, ...reasonOf(t) }] : [])),
    bashPatterns: listOf(manifest.bashPatterns)
      .flatMap(p => (typeof p.pattern === 'string' ? [{ pattern: p.pattern, ...reasonOf(p) }] : [])),
  }
  return {
    runId: run.id,
    sessionId: run.sessionId,
    summary: typeof manifest.summary === 'string' ? manifest.summary : null,
    pendingManifest,
  }
}
