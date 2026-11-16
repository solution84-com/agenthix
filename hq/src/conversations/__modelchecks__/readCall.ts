/**
 * How a run's tool calls are read when tools are found by search (ADR-0193): a call of `use_tool` with
 * `{ name, input }` is the call of `name` with `input`, so every grade reads what the agent did and not the route; a
 * call of `find_tools` stays itself. `find_tools` is answered by the real search (tools/search) over the tools the run
 * finds by search, in the shape a real turn answers; a `use_tool` as the named tool would answer, or refused as a turn
 * refuses a name it may not use.
 */
import { z } from 'zod'
import { FIND_TOOLS, USE_TOOL, inputRefusal, nothingFoundNote, notAToolRefusal, type FindToolsAnswer, type ToolArea } from '@agenthix/core'
import type { Embedder } from '../../memory/contract'
import { searchTools, type ToolEntry } from '../../tools/search'

export { FIND_TOOLS, USE_TOOL }

/** A tool a run may find: its input a Zod schema (hq's) or a JSON schema already; its area when it has one. */
export interface SearchableTool { name: string; description: string; input?: unknown; area?: ToolArea }

export interface ReadOptions {
  /** The model the search embeds with: hq's built-in one in a real run; absent or null, words alone (unit tests). */
  embedder?: Embedder | null
  /** Every name the run may call, shown or found: a use_tool of any other is refused. Absent, none is refused. */
  permitted?: readonly string[]
  /**
   * The tools a run may call, with their inputs: input that doesn't fit is refused, through use_tool with the tool's
   * definition, as a turn and a run refuse it. Absent, the input is not checked.
   */
  definitions?: readonly SearchableTool[]
}

/** The call a model's call stands for: `use_tool`'s own `name` and `input`, any other call as it is. */
export function readCall(name: string, input: unknown): { name: string; input: unknown } {
  if (name !== USE_TOOL || !input || typeof input !== 'object') return { name, input }
  const { name: inner, input: innerInput } = input as { name?: unknown; input?: unknown }
  if (typeof inner !== 'string' || inner.trim() === '') return { name, input }
  return { name: inner.trim(), input: innerInput && typeof innerInput === 'object' ? innerInput : {} }
}

const jsonSchemaOf = (input: unknown): unknown => (input instanceof z.ZodType ? z.toJSONSchema(input) : input ?? { type: 'object', properties: {} })

function entryOf(tool: SearchableTool): ToolEntry {
  return { name: tool.name, area: tool.area ?? 'tasks', description: tool.description, input: jsonSchemaOf(tool.input) }
}

/** `find_tools` as a turn answers it: the best matches with their full definitions, never itself or `use_tool`. */
export async function findToolsAnswer(input: unknown, searchable: readonly SearchableTool[], options: ReadOptions = {}): Promise<FindToolsAnswer> {
  const query = input && typeof input === 'object' ? (input as { query?: unknown }).query : undefined
  const tools = searchable.filter(t => t.name !== FIND_TOOLS && t.name !== USE_TOOL)
  const found = typeof query === 'string' ? await searchTools(query, tools.map(entryOf), { embedder: options.embedder ?? null }) : []
  if (found.length > 0) return { tools: found }
  return { tools: [], note: nothingFoundNote() }
}

/**
 * What the model reads of one call: `find_tools` from the searchable tools, a `use_tool` of a name it may not use
 * refused, any other as the script answers its read call.
 */
export async function answerRead(
  call: { name: string; input: unknown },
  searchable: readonly SearchableTool[],
  script: (name: string, input: unknown) => unknown,
  options: ReadOptions = {},
): Promise<unknown> {
  if (call.name === FIND_TOOLS) return findToolsAnswer(call.input, searchable, options)
  const read = readCall(call.name, call.input)
  if (call.name === USE_TOOL && options.permitted && (read.name === FIND_TOOLS || read.name === USE_TOOL || !options.permitted.includes(read.name))) {
    return { status: 'refused', reason: notAToolRefusal(read.name) }
  }
  // Input that doesn't fit is refused as a turn refuses it: through use_tool with the tool's definition, called
  // natively in the turn's own words.
  const named = options.definitions?.find(t => t.name === read.name)
  if (named?.input instanceof z.ZodType) {
    const fits = named.input.safeParse(read.input ?? {})
    if (!fits.success) {
      const problems = fits.error.issues.map(i => `${i.path.join('.') || 'input'}: ${i.message}`).join('; ')
      const reason = call.name === USE_TOOL ? inputRefusal(entryOf(named), problems) : `The arguments do not fit ${read.name}: ${problems}`
      return { status: 'refused', reason }
    }
  }
  return script(read.name, read.input)
}
