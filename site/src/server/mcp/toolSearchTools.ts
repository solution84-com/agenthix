/**
 * The tool search in a run (lean agent context spec §4–§5, ADR-0193): a run is shown its must-have tools, and finds
 * the rest of the tools it is offered with `find_tools`, answered by hq, which holds the index, and calls them with
 * `use_tool`. A tool called through `use_tool` takes the same path as its native call: the gate has already decided
 * it on its own name (agents/runtime/toolSearchCall.ts), and here its input is checked against its own declaration
 * and it is forwarded to hq as its native call is, with the calling run filled in where it takes one.
 */
import { z, type ZodRawShape } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import {
  FIND_TOOLS, FIND_TOOLS_DECLARATION, RUN_MUST_HAVES, USE_TOOL, USE_TOOL_DECLARATION, areaLines, inputRefusal,
  type FindToolsAnswer, type FoundTool,
} from '@agenthix/core'
import type { ForwardedTool } from './forwardedToolSchemas'
import { innerCallOf } from '../../agents/runtime/toolSearchCall'

type ToolResult = { content: { type: 'text'; text: string }[]; isError?: true }

const MUST_HAVES: ReadonlySet<string> = new Set(RUN_MUST_HAVES)

/** Whether a forwarded tool is shown to a run in full; every other one it is offered is found by search. */
export const isMustHave = (name: string): boolean => MUST_HAVES.has(name)

/** What the agent is shown of a tool: a field the site fills in from the calling run is not the agent's to give. */
export function agentSchema(tool: ForwardedTool): ZodRawShape {
  if (!tool.runIdFromCaller) return tool.schema
  const { runId: _filledIn, ...shown } = tool.schema
  return shown
}

/** The paragraph that names, by area, the tools a run was offered and not shown. */
export function foldedAreaLines(folded: readonly ForwardedTool[]): string {
  return areaLines(folded)
}

export interface ToolSearchOptions {
  /** The forwarded tools this run is offered and not shown, by name. */
  folded: ReadonlyMap<string, ForwardedTool>
  /** The forwarded tools this run is shown, by name: use_tool may call them too. */
  shown: ReadonlyMap<string, ForwardedTool>
  /** The tools the site serves itself to this run: called by their own name, never through use_tool. */
  siteServed: ReadonlySet<string>
  /** Asks hq (the data path) for the tools matching a query among the named ones. */
  askHq: (query: string, among: string[]) => Promise<unknown>
  /** Runs a forwarded tool as its native call is run. */
  forward: (tool: ForwardedTool, args: Record<string, unknown>) => Promise<ToolResult>
}

const text = (t: string, isError = false): ToolResult =>
  ({ content: [{ type: 'text', text: t }], ...(isError ? { isError: true as const } : {}) })

/** A found tool as the run would have been shown it natively: the site's own declaration, not hq's copy. */
function asShown(tool: ForwardedTool, found: FoundTool): FoundTool {
  return {
    name: tool.name,
    description: tool.description ?? found.description,
    input: z.toJSONSchema(z.object(agentSchema(tool)), { io: 'input' }),
  }
}

function answerOf(raw: unknown, folded: ReadonlyMap<string, ForwardedTool>): FindToolsAnswer {
  const answer = (raw && typeof raw === 'object' ? raw : {}) as Partial<FindToolsAnswer>
  const tools = (Array.isArray(answer.tools) ? answer.tools : [])
    .filter((t): t is FoundTool => !!t && typeof t.name === 'string' && folded.has(t.name))
    .map(t => asShown(folded.get(t.name)!, t))
  if (tools.length) return { tools }
  const areas = foldedAreaLines([...folded.values()])
  return { tools: [], note: typeof answer.note === 'string' ? answer.note : `No tool matches that. Try other words.${areas ? ` ${areas}` : ''}` }
}

export function registerToolSearchTools(server: McpServer, opts: ToolSearchOptions): void {
  const among = [...opts.folded.keys()]

  server.tool(
    FIND_TOOLS,
    FIND_TOOLS_DECLARATION.description,
    { query: z.string().min(1).max(500).describe(FIND_TOOLS_DECLARATION.args.query!.description) },
    async ({ query }: { query: string }) => {
      if (among.length === 0) return text(JSON.stringify({ tools: [], note: 'This run has no other tools to find.' }))
      return text(JSON.stringify(answerOf(await opts.askHq(query, among), opts.folded)))
    },
  )

  server.tool(
    USE_TOOL,
    USE_TOOL_DECLARATION.description,
    {
      name: z.string().describe(USE_TOOL_DECLARATION.args.name!.description),
      // A model may send the input as JSON text: read as the object it holds (toolSearchCall.ts).
      input: z.union([z.record(z.string(), z.unknown()), z.string()]).optional().describe(USE_TOOL_DECLARATION.args.input!.description),
    },
    async (args: { name: string; input?: unknown }) => {
      const inner = innerCallOf(args)
      if (!inner) return text('Name a tool that find_tools found, and give its input as an object. Nothing was run.', true)
      if (opts.siteServed.has(inner.name)) return text(`${inner.name} is one of your tools: call it directly. Nothing was run.`, true)
      const tool = opts.folded.get(inner.name) ?? opts.shown.get(inner.name)
      if (!tool) return text(`There is no tool named ${inner.name} for this run. Search with find_tools. Nothing was run.`, true)
      const parsed = z.object(agentSchema(tool)).safeParse(inner.input)
      if (!parsed.success) {
        // With the tool's definition, so the run can call it again without a search.
        const problems = parsed.error.issues.map(i => `${i.path.join('.') || 'input'}: ${i.message}`).join('; ')
        return text(inputRefusal(asShown(tool, { name: tool.name, description: tool.name, input: null }), problems), true)
      }
      return opts.forward(tool, parsed.data)
    },
  )
}
