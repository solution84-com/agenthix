/**
 * The tool search in a conversation's reply (ADR-0193; lean agent context spec, §1, §4 and §5): a turn is shown its
 * must-have tools, and the tools that apply only now, in full; every other tool it may use is folded, found with
 * find_tools and called with use_tool. The tool list doesn't change within a conversation, so the cached prefix stays.
 */
import { z } from 'zod'
import {
  CONVERSATION_MUST_HAVES, FIND_TOOLS, FIND_TOOLS_DECLARATION, USE_TOOL, USE_TOOL_DECLARATION, nothingFoundNote,
  type FindToolsAnswer, type FoldedName, type ToolArea, type ToolSearchDeclaration,
} from '@agenthix/core'
import type { LeadToolCall, LeadToolDefinition, OfferedTool } from '../contract'
import { searchTools, type SearchOptions, type ToolEntry } from '../../tools/search'
import { ANSWER_APPROVAL, CANCEL_OPERATION } from '../work/toolCalls/leadTools'
import { KEEP_LISTENING } from '../lead/voiceLogic'
import { OFFER_LIVE_PREVIEW_TOOL } from '../../livePreviews/offer'

/**
 * Offered only while they apply, and then shown: an approval waits, work runs, the person listens, a live preview
 * can be offered, or something was folded (the compaction block names expand and messages).
 */
const SHOWN_WHILE_THEY_APPLY: ReadonlySet<string> = new Set([
  ANSWER_APPROVAL, CANCEL_OPERATION, KEEP_LISTENING, OFFER_LIVE_PREVIEW_TOOL, 'expand', 'messages',
])

const SHOWN: ReadonlySet<string> = new Set([...CONVERSATION_MUST_HAVES, ...SHOWN_WHILE_THEY_APPLY])

export function isShown(name: string): boolean {
  return SHOWN.has(name)
}

function inputOf(declaration: ToolSearchDeclaration): z.ZodType {
  return z.object(Object.fromEntries(Object.entries(declaration.args).map(([name, arg]) => {
    const base = arg.type === 'string' ? z.string() : z.record(z.string(), z.unknown())
    const described = base.describe(arg.description)
    return [name, arg.optional ? described.optional() : described]
  })))
}

export const FIND_TOOLS_DEFINITION: LeadToolDefinition = {
  name: FIND_TOOLS, description: FIND_TOOLS_DECLARATION.description, input: inputOf(FIND_TOOLS_DECLARATION),
}
export const USE_TOOL_DEFINITION: LeadToolDefinition = {
  name: USE_TOOL, description: USE_TOOL_DECLARATION.description, input: inputOf(USE_TOOL_DECLARATION),
}

/** What the turn shows, and what it folds; the two search tools join what it shows once anything is folded. */
export function fold(offered: readonly OfferedTool[]): { shown: LeadToolDefinition[]; folded: OfferedTool[] } {
  const folded = offered.filter(t => !isShown(t.name))
  const shown: LeadToolDefinition[] = offered.filter(t => isShown(t.name)).map(({ name, description, input }) => ({ name, description, input }))
  return { shown: folded.length > 0 ? [...shown, FIND_TOOLS_DEFINITION, USE_TOOL_DEFINITION] : shown, folded }
}

/** The areas of the folded tools, each once. */
export function foldedAreas(folded: readonly OfferedTool[]): ToolArea[] {
  return [...new Set(folded.map(t => t.area))]
}

/** The folded tools as the area lines name them. */
export function foldedNames(folded: readonly OfferedTool[]): FoldedName[] {
  return folded.map(({ name, area }) => ({ name, area }))
}

/** An index entry, its input as the JSON schema the native tool would have sent. */
export function entryOf(tool: OfferedTool): ToolEntry {
  return { name: tool.name, area: tool.area, description: tool.description, input: z.toJSONSchema(tool.input) }
}

export async function findTools(input: unknown, folded: readonly OfferedTool[], opts?: SearchOptions): Promise<FindToolsAnswer> {
  const query = input && typeof input === 'object' ? (input as { query?: unknown }).query : undefined
  const tools = typeof query === 'string' ? await searchTools(query, folded.map(entryOf), opts) : []
  return tools.length > 0 ? { tools } : { tools: [], note: nothingFoundNote() }
}

/** A call as it runs: a use_tool call is the call of the tool it names, marked as having come through use_tool. */
export interface ReadToolCall extends LeadToolCall { via?: typeof USE_TOOL }

/**
 * A use_tool call as the call of the tool it names; any other call as it is. A `reason` given beside `input`, rather
 * than in it, goes in it: the tool at Ask reads it there.
 */
export function unwrapUseTool(call: LeadToolCall): ReadToolCall {
  if (call.name !== USE_TOOL || !call.input || typeof call.input !== 'object') return call
  const { name, input, reason } = call.input as { name?: unknown; input?: unknown; reason?: unknown }
  if (typeof name !== 'string' || name.trim() === '') return call
  const inner = input && typeof input === 'object' && !Array.isArray(input) ? { ...(input as Record<string, unknown>) } : {}
  if (typeof reason === 'string' && inner.reason === undefined) inner.reason = reason
  return { id: call.id, name: name.trim(), input: inner, via: USE_TOOL }
}

/** The name the model called, which its result answers under. */
export function calledName(call: ReadToolCall): string {
  return call.via ?? call.name
}
