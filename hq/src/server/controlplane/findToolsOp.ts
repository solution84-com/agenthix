/**
 * `find_tools` on the data path (lean agent context spec §4–§6, ADR-0193): a run's site forwards the agent's search,
 * and hq answers it from the tool index over the control-plane tools this run may use. Searching grants nothing: a
 * tool at Never in the run's capability is never an entry, and the site names the tools it offers the run (`among`),
 * which only narrows what hq would find. Data-path only: hq's MCP server for people's own clients lists every tool.
 */
import { z, type ZodRawShape, type ZodType } from 'zod'
import { FIND_TOOLS, WITHDRAWN_FROM_AGENTS, nothingFoundNote, type FindToolsAnswer } from '@agenthix/core'
import { searchTools, type ToolEntry } from '../../tools/search'
import { ALL_CONTROL_PLANE_TOOLS, type ControlPlaneTool } from './toolSchemas'
import { ControlPlaneError, type CallerContext } from './types'

export const FIND_TOOLS_MAX_QUERY = 500
const MAX_AMONG = 300

export const FIND_TOOLS_SCHEMA: ControlPlaneTool = {
  name: FIND_TOOLS,
  area: 'run',
  description: 'Find the tools for what you want to do.',
  schema: {
    query: z.string().min(1).max(FIND_TOOLS_MAX_QUERY).describe('What you want to do, or a tool\'s name'),
    among: z.array(z.string().min(1).max(100)).max(MAX_AMONG).optional()
      .describe('Filled in by the site with the tools it offers the run; leave it out'),
  },
}

const SITE_FILLED = 'Filled in by the site'

/** What the agent gives: a field the site fills in from the calling run is not shown. */
function agentInput(schema: ZodRawShape): unknown {
  const shown = Object.fromEntries(
    Object.entries(schema).filter(([, field]) => !((field as ZodType).description ?? '').startsWith(SITE_FILLED)),
  )
  return z.toJSONSchema(z.object(shown), { io: 'input' })
}

let entriesMade: ToolEntry[] | null = null

/** Every control-plane tool as an index entry, made once: the declarations ship with the code. */
function allEntries(): ToolEntry[] {
  entriesMade ??= ALL_CONTROL_PLANE_TOOLS.filter(t => !WITHDRAWN_FROM_AGENTS.includes(t.name)).map(t => ({
    name: t.name, area: t.area, description: t.description ?? t.name.replace(/_/g, ' '), input: agentInput(t.schema),
  }))
  return entriesMade
}

/** The entries a run may use: none at Never, and only those its site offers it when the site names them. */
export function entriesForRun(neverTools: readonly string[], among: readonly string[] | undefined): ToolEntry[] {
  const never = new Set(neverTools)
  const offered = among ? new Set(among) : null
  return allEntries().filter(e => !never.has(e.name) && (!offered || offered.has(e.name)))
}

function nothingFound(entries: readonly ToolEntry[]): string {
  return entries.length ? nothingFoundNote() : 'No tool matches that, and this run has no other tools to find.'
}

export async function findToolsOp(ctx: CallerContext, args: { query: string; among?: string[] }): Promise<FindToolsAnswer> {
  if (ctx.kind !== 'run') throw new ControlPlaneError('forbidden', `${FIND_TOOLS} is a run's own tool`)
  const entries = entriesForRun(ctx.claims.permissions.neverTools, args.among)
  const tools = await searchTools(args.query, entries)
  return tools.length ? { tools } : { tools: [], note: nothingFound(entries) }
}
