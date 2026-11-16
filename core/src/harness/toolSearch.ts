/**
 * The tool search (ADR-0193; lean agent context spec, §1, §3 and §4): an agent is shown its must-have tools in full,
 * told the areas of everything else in a few lines, and finds the rest with `find_tools`, then calls one with
 * `use_tool`. Declared once here so a conversation (hq) and a background run (the site) offer the same words.
 *
 * Core carries no schema library: each side builds the two tools' input from the arguments described here.
 */
import { TOOL_AREAS, type ToolArea } from './toolAreas.js'

export const FIND_TOOLS = 'find_tools'
export const USE_TOOL = 'use_tool'

/**
 * Shown in full in a conversation's reply (spec §1). `answer_approval`, `keep_listening` and `offer_live_preview`
 * are also shown, only while they apply, as before. `open_board` joined the set after the baseline checks: going
 * through a board with the agent is a common ask, and a bare name beside list_tasks did not lead to it.
 */
export const CONVERSATION_MUST_HAVES: readonly string[] = [
  'start_work', 'create_task', 'run_task', 'update_task', 'list_tasks', 'get_task_details', 'open_board',
  'recall', 'remember', 'used_memory', 'search_knowledge', 'read_knowledge', 'suggest_place', 'ledger',
  FIND_TOOLS, USE_TOOL,
]

/**
 * Shown in full in a background run (spec §1), where they apply: code work's tools with a code workspace, the app
 * tools with the live preview on. The harness's own file and shell tools are shown too, and never folded: they are
 * the harness's, not the platform's, so they are not named here.
 */
export const RUN_MUST_HAVES: readonly string[] = [
  'set_result', 'add_comment', 'get_task_details', 'update_task', 'create_task',
  'recall', 'remember', 'search_knowledge', 'read_knowledge',
  'commit', 'update_from_main', 'merge_into_main',
  'start_app', 'list_apps', 'reload_view',
  'stop_processes', 'install_packages',
  FIND_TOOLS, USE_TOOL,
]

/**
 * Legacy tools no longer offered to an agent, in a conversation or a run (the owner, 16 Nov 2026): the queue a run
 * fetched before tasks were dispatched to it, and subtasks ticked one by one. hq still serves them, so no peer breaks.
 */
export const WITHDRAWN_FROM_AGENTS: readonly string[] = ['fetch_my_queued_tasks', 'tick_subtask']

/** A folded tool as the area lines name it: its name and its area. */
export interface FoldedName {
  name: string
  area: ToolArea
}

/** Each area as the tool-name lines label it, in words a person would use (the owner, 16 Nov 2026). */
export const AREA_LABELS: Record<ToolArea, string> = {
  tasks: 'tasks',
  planning: 'planning boards, sprints and milestones',
  knowledge: 'knowledge pages',
  memory: 'memory',
  organisation: 'people, agents and projects',
  code: 'code and branches',
  apps: 'apps',
  workflows: 'workflows',
  skills: 'skills',
  conversation: 'this conversation',
  run: "what's running",
}

/**
 * The paragraph after the must-haves (spec §3; the owner's change of 16 Nov 2026): every folded tool by its name,
 * grouped by area in a fixed order, with no descriptions, and the rule to search before saying something can't be
 * done. Empty when nothing is folded.
 */
export function areaLines(folded: readonly FoldedName[]): string {
  const groups = TOOL_AREAS.flatMap(area => {
    const names = [...new Set(folded.filter(t => t.area === area).map(t => t.name))]
    return names.length > 0 ? [`- ${AREA_LABELS[area]}: ${names.join(', ')}`] : []
  })
  if (groups.length === 0) return ''
  return [
    `More tools, called with ${USE_TOOL} by name (${FIND_TOOLS} gives one's description and input, or finds a tool by what you want to do):`,
    ...groups,
    `Before telling the person something can't be done, search for a tool with ${FIND_TOOLS}. When what it finds doesn't do it, say you can't, and why.`,
  ].join('\n')
}

/** One tool found: its name, its full description and its input as a JSON schema, as a native tool is shown. */
export interface FoundTool {
  name: string
  description: string
  input: unknown
}

export interface FindToolsAnswer {
  tools: FoundTool[]
  /** Said when nothing passed the bar (`nothingFoundNote`). */
  note?: string
}

/** The most tools one search answers. */
export const FOUND_AT_MOST = 5

/**
 * What find_tools says when nothing passed the bar. Every tool the agent may use is named in its instructions, so the
 * note sends it back to those names rather than to more searching, which a low-cost model repeats until its turn ends.
 */
export function nothingFoundNote(): string {
  return 'No tool you may use matches that: there may be none, or you may not be allowed it. Every tool you may use ' +
    'is named in your instructions. If none of those names does it, do not search again: tell the person you can\'t ' +
    'do it here, and why.'
}

/**
 * The refusal of a use_tool call whose input doesn't fit the tool: the problems, then the tool's full definition, so
 * the model can call it again without a search.
 */
export function inputRefusal(tool: FoundTool, problems: string): string {
  return `The input does not fit ${tool.name}: ${problems}. Nothing was run. ${tool.name}: ${tool.description} ` +
    `Its input: ${JSON.stringify(tool.input)}. Call ${USE_TOOL} again with input that fits.`
}

/** The line a use_tool call of a name the agent may not use, or that does not exist, is refused with. */
export function notAToolRefusal(name: string): string {
  return `${name} is not a tool you can use here. Search with ${FIND_TOOLS} for one that does what you want.`
}

/** An argument of the two tools, described plainly; each side builds its own schema from it. */
export interface ToolSearchArg {
  type: 'string' | 'object'
  description: string
  optional?: true
}

export interface ToolSearchDeclaration {
  name: typeof FIND_TOOLS | typeof USE_TOOL
  area: ToolArea
  description: string
  args: Record<string, ToolSearchArg>
}

export const FIND_TOOLS_DECLARATION: ToolSearchDeclaration = {
  name: FIND_TOOLS,
  area: 'conversation',
  description:
    `Find tools for what you want to do, or a tool by its name. Answers the best matches, each with its description and input; call one with ${USE_TOOL}.`,
  args: {
    query: { type: 'string', description: 'What you want to do, in a few words ("set a task\'s milestone"), or a tool\'s name' },
  },
}

export const USE_TOOL_DECLARATION: ToolSearchDeclaration = {
  name: USE_TOOL,
  area: 'conversation',
  description:
    `Call a tool by its name: one your instructions name, or one ${FIND_TOOLS} found. Its answer is the tool's own; input that doesn't fit is answered with the tool's description and input. A tool whose input has a reason waits for a person's yes.`,
  args: {
    name: { type: 'string', description: `The tool's name, as ${FIND_TOOLS} gave it` },
    input: { type: 'object', description: "The tool's input, as its input schema says" },
  },
}
