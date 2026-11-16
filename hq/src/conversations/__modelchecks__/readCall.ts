/**
 * How a run's tool calls are read when tools are found by search (ADR-0193): a call of `use_tool` with
 * `{ name, input }` is the call of `name` with `input`, so every grade reads what the agent did and not the route; a
 * call of `find_tools` stays itself. The scripts answer `find_tools` from the tools the run was offered, and a
 * `use_tool` as the named tool would answer.
 */
import type { LeadToolDefinition } from '../contract'

export const USE_TOOL = 'use_tool'
export const FIND_TOOLS = 'find_tools'

const FOUND_AT_MOST = 5

/** The call a model's call stands for: `use_tool`'s own `name` and `input`, any other call as it is. */
export function readCall(name: string, input: unknown): { name: string; input: unknown } {
  if (name !== USE_TOOL || !input || typeof input !== 'object') return { name, input }
  const { name: inner, input: innerInput } = input as { name?: unknown; input?: unknown }
  if (typeof inner !== 'string' || inner.trim() === '') return { name, input }
  return { name: inner.trim(), input: innerInput && typeof innerInput === 'object' ? innerInput : {} }
}

/** `find_tools` as a word match over the tools the run was offered; it never offers itself or `use_tool`. */
export function findToolsAnswer(input: unknown, offered: readonly Pick<LeadToolDefinition, 'name' | 'description'>[]): unknown {
  const query = input && typeof input === 'object' ? (input as { query?: unknown }).query : undefined
  const words = (typeof query === 'string' ? query : '').toLowerCase().split(/[^a-z0-9_]+/).filter(w => w.length > 2)
  const scored = offered
    .filter(t => t.name !== FIND_TOOLS && t.name !== USE_TOOL)
    .map(t => ({ t, score: words.filter(w => `${t.name} ${t.description}`.toLowerCase().includes(w)).length }))
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, FOUND_AT_MOST)
  if (scored.length === 0) return { tools: [], note: 'No tool matches. Try other words.' }
  return { tools: scored.map(s => ({ name: s.t.name, description: s.t.description })) }
}

/** What the model reads of one call: `find_tools` from the offered tools, any other as the script answers its read call. */
export async function answerRead(
  call: { name: string; input: unknown },
  offered: readonly Pick<LeadToolDefinition, 'name' | 'description'>[],
  script: (name: string, input: unknown) => unknown,
): Promise<unknown> {
  if (call.name === FIND_TOOLS) return findToolsAnswer(call.input, offered)
  const read = readCall(call.name, call.input)
  return script(read.name, read.input)
}
