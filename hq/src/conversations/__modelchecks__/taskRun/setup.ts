/**
 * What a task's run on a branch is sent (W12 of the live preview walk): the parts of its prompt shared with the site
 * (core's `codeWorkPromptText` and `PLATFORM_TOOLS_INSTRUCTIONS`), its first message as hq gives it (`taskRunInput`), and
 * the platform tools a code-work run is offered, built from hq's own declarations, which the site forwards: its
 * must-haves in full, and the rest found with find_tools and called with use_tool (ADR-0193). The task prompt's
 * sections are core's, as the site joins them (`harness/runPromptSections.ts`); only its filesystem section, which
 * reads the run's mounts, is a short stand-in here.
 */
import { z, type ZodRawShape } from 'zod'
import {
  FIND_TOOLS_DECLARATION, NO_WEB_SEARCH_INSTRUCTIONS, buildAgentIdentityContent, buildBoardSection, buildMemoryContent,
  buildNewCommentsSection, buildNoAgendaSection, buildTaskExecutionSection, buildTaskSection, PLATFORM_TOOLS_INSTRUCTIONS, RUN_MUST_HAVES, USE_TOOL_DECLARATION,
  WITHDRAWN_FROM_AGENTS, areaLines, codeWorkPromptText, webSearchWithheldInstructions, type RunOpenLivePreview, type WebSearchWithheld,
} from '@agenthix/core'
import type { LeadMessage, LeadToolDefinition, PromptPart } from '../../contract'
import { ALL_CONTROL_PLANE_TOOLS, type ControlPlaneTool } from '../../../server/controlplane/toolSchemas'
import { taskRunInput } from '../../taskThread/brief'
import { KERNEL, ROADMAP, SHOP_TASK, WORKING_FOLDER, codeWork } from './world'

export interface TaskRunSetup {
  /** The branch's live preview when the run starts; null when none is open. */
  openLivePreview: RunOpenLivePreview | null
  behindMain?: number
  /** A person's ask passed on from the task's conversation, as the run's brief. */
  brief?: string
  /** Comments written on the task since the last run, newest last: who wrote each and what. */
  newComments?: readonly { author: string; text: string }[]
  /**
   * An OpenCode run of an organisation with no search key: told so in the words the site sends, and offered OpenCode's
   * own web_fetch and no web_search, as such a turn is.
   */
  noWebSearchKey?: true
  /**
   * A run whose agent's tools withhold web search (walkthrough finding W2): told so in the words the site sends, and
   * offered web_fetch, at Ask by default, and no web_search.
   */
  webSearchWithheld?: WebSearchWithheld
}

const FIRST_MESSAGE = 'Execute your assigned task.'

const COLUMNS = '- Backlog\n- To do\n- In progress\n- Done'

/** The task prompt as the site's `buildTaskPrompt` joins it, for an agent with no instructions of its own. */
function frame(setup: TaskRunSetup): string {
  const comments = (setup.newComments ?? []).map(c => ({ ...c, at: '2026-11-16T09:00:00.000Z' }))
  const sections = [
    buildAgentIdentityContent({ id: KERNEL.id, name: KERNEL.name, handle: KERNEL.handle, role: null }),
    buildMemoryContent(),
    buildNoAgendaSection(),
    buildBoardSection('Shop board', COLUMNS),
    buildTaskSection(SHOP_TASK.id, SHOP_TASK.title, SHOP_TASK.description),
    ...(comments.length ? [buildNewCommentsSection(comments)] : []),
    buildTaskExecutionSection(ROADMAP),
    `## Filesystem\n\n- **Working directory (cwd):** \`${WORKING_FOLDER}\` — your working copy of your branch.`,
  ]
  return sections.join('\n\n---\n\n')
}

/** The site's server instructions: the platform tools' rules, then what else the run can do (mcpServer.ts there). */
export function runPlatformInstructions(): string {
  return `${PLATFORM_TOOLS_INSTRUCTIONS}\n\n${areaLines(FOLDED)}`
}

export function taskRunContext(setup: TaskRunSetup): { system: PromptPart[]; messages: LeadMessage[] } {
  return {
    system: [
      { text: frame(setup) },
      { text: runPlatformInstructions() },
      { text: codeWorkPromptText(codeWork(setup.openLivePreview, setup.behindMain ?? 0), { livePreview: true }) },
      ...(setup.noWebSearchKey ? [{ text: NO_WEB_SEARCH_INSTRUCTIONS }] : []),
      ...(setup.webSearchWithheld ? [{ text: webSearchWithheldInstructions(setup.webSearchWithheld) }] : []),
    ],
    messages: [{ role: 'user', content: taskRunInput(FIRST_MESSAGE, setup.brief ?? null) }],
  }
}

/** The harness's built-in file and command tools, as a run's harness offers them, in plain words. */
const BUILT_INS: LeadToolDefinition[] = [
  { name: 'read_file', description: 'Read a file in your working folder.', input: z.object({ file_path: z.string() }) },
  { name: 'write_file', description: 'Write a whole file.', input: z.object({ file_path: z.string(), content: z.string() }) },
  {
    name: 'edit_file', description: 'Replace text in a file.',
    input: z.object({ file_path: z.string(), old_string: z.string(), new_string: z.string() }),
  },
  { name: 'glob_files', description: 'Find files by a glob pattern.', input: z.object({ pattern: z.string() }) },
  { name: 'grep_files', description: 'Search file contents for a pattern.', input: z.object({ pattern: z.string(), path: z.string().optional() }) },
  { name: 'bash', description: 'Run a shell command in your working folder.', input: z.object({ command: z.string() }) },
]

/** The platform tools as the site shows them: the run's id is filled in by the site, so it is not the agent's to give. */
function shown(schema: ZodRawShape): z.ZodType {
  const { runId: _filledIn, ...rest } = schema
  return z.object(rest)
}

/** OpenCode's own page fetch, which a run has with or without a search key. */
const WEB_FETCH: LeadToolDefinition = {
  name: 'web_fetch', description: 'Fetch the content of a web page by its address.', input: z.object({ url: z.string() }),
}

const MUST_HAVES: ReadonlySet<string> = new Set(RUN_MUST_HAVES)
const asDefinition = (t: ControlPlaneTool): LeadToolDefinition => ({ name: t.name, description: t.description ?? t.name, input: shown(t.schema) })
const FOLDED = ALL_CONTROL_PLANE_TOOLS.filter(t => !MUST_HAVES.has(t.name) && !WITHDRAWN_FROM_AGENTS.includes(t.name))

/** The search's two tools, in the site's shapes (toolSearchTools.ts there). */
const SEARCH_TOOLS: LeadToolDefinition[] = [
  {
    name: FIND_TOOLS_DECLARATION.name, description: FIND_TOOLS_DECLARATION.description,
    input: z.object({ query: z.string().describe(FIND_TOOLS_DECLARATION.args.query!.description) }),
  },
  {
    name: USE_TOOL_DECLARATION.name, description: USE_TOOL_DECLARATION.description,
    input: z.object({
      name: z.string().describe(USE_TOOL_DECLARATION.args.name!.description),
      input: z.union([z.record(z.string(), z.unknown()), z.string()]).optional().describe(USE_TOOL_DECLARATION.args.input!.description),
    }),
  },
]

/** The platform tools a run is offered and not shown: what its find_tools searches. */
export function taskRunFoldedTools(): LeadToolDefinition[] {
  return FOLDED.map(asDefinition)
}

export function taskRunTools(setup?: TaskRunSetup): LeadToolDefinition[] {
  const platform = ALL_CONTROL_PLANE_TOOLS.filter(t => MUST_HAVES.has(t.name)).map(asDefinition)
  return [...BUILT_INS, ...(setup?.noWebSearchKey || setup?.webSearchWithheld ? [WEB_FETCH] : []), ...platform, ...SEARCH_TOOLS]
}
