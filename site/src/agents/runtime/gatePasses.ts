/**
 * Platform tool calls the gate has already allowed, waiting for the platform
 * server (`/mcp`) to serve them. A harness asks the gate before it calls a
 * platform tool, then sends the call to `/mcp`, which serves it on the pass
 * without deciding or recording it a second time. A call that comes with no
 * pass — not made through the harness's gate — is decided at `/mcp` as any call is
 * (server/mcp/mcpCallGate.ts). Held in memory, one use each, for a few minutes.
 */
import { ALL_RUNTIME_TOOL_NAMES, RUNTIME_TOOLS } from '../../shared/runtimeTools'

const PASS_MS = 5 * 60_000
const MAX_PASSES = 1000

const passes = new Map<string, number>()

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(k => [k, stable((value as Record<string, unknown>)[k])]))
  }
  return value
}

const key = (runId: string, toolName: string, input: unknown) => `${runId}\0${toolName}\0${JSON.stringify(stable(input ?? {}))}`

/** Whether `/mcp` can serve the tool: a harness's own built-ins never reach it, except OpenCode's web search. */
export function servedByPlatform(toolName: string): boolean {
  return toolName === RUNTIME_TOOLS.WEB.WEB_SEARCH || !ALL_RUNTIME_TOOL_NAMES.has(toolName)
}

export function grantPass(runId: string, toolName: string, input: unknown, now = Date.now()): void {
  if (!servedByPlatform(toolName)) return
  for (const [k, at] of passes) {
    if (now - at < PASS_MS && passes.size < MAX_PASSES) break
    passes.delete(k)
  }
  const k = key(runId, toolName, input)
  passes.delete(k)
  passes.set(k, now)
}

/** Takes the pass for this call, when the gate allowed one like it; false when there is none. */
export function takePass(runId: string, toolName: string, input: unknown, now = Date.now()): boolean {
  const k = key(runId, toolName, input)
  const at = passes.get(k)
  if (at === undefined) return false
  passes.delete(k)
  return now - at < PASS_MS
}

/** Test seam. */
export function resetPassesForTests(): void {
  passes.clear()
}
