/**
 * One tool call as one plain step of the work line (every screen reviewed,
 * *What the agent did*): what kind of thing the agent did, a verb and a short
 * description, and for a change what it changed. Never a raw tool name: a
 * tool this table does not know reads as "Used a tool".
 *
 * A call arrives under whichever name its harness uses — Claude's (`Read`,
 * `mcp__platform__create_task`), OpenCode's (`read`, `create_task`), or the
 * platform's canonical one (`read_file`) — and is read under one name here.
 */

import { COMMIT_TOOL_NAME } from '../codeWork/commitTool.js'
import { MERGE_TOOL_NAME } from '../codeWork/mergeTool.js'
import { UPDATE_TOOL_NAME } from '../codeWork/updateTool.js'
import { START_APP_TOOL, STOP_APP_TOOL, LIST_APPS_TOOL, RELOAD_VIEW_TOOL, SET_AUTO_RELOAD_TOOL } from '../livePreview/appTools.js'
import { WORKFLOW_TOOL_NAMES } from '../workflows/agentTools.js'
import { PROPOSE_SKILL_TOOL } from '../assets/skillTools.js'

export type WorkStepKind = 'looked' | 'changed' | 'ran' | 'thought' | 'asked' | 'failed' | 'stopped' | 'other'

/**
 * What a step points at, for its link: a task (by id, and by key when the call's answer gave it), a board, a file, or
 * a skill by the name it was staged under, which hq maps to what was used through the run's record of its skills.
 */
export type WorkTarget =
  | { type: 'task'; id: string | null; key: string | null }
  | { type: 'board'; id: string }
  | { type: 'file'; path: string }
  | { type: 'skill'; name: string }

export type ToolStep = {
  kind: WorkStepKind
  verb: string
  /** What it acted on, plainly: a file name, a command, a task's title. Empty when the verb says it all. */
  text: string
  /** The thing counted in the folded line ("12 tasks"), singular; null when the step is not counted. */
  noun: string | null
  /** How many of `noun` the step covers — a listing's items when its answer can be read, else 1. */
  count: number
  target: WorkTarget | null
}

/** What a person is asked to allow, as an action: "Fetch a web page". */
export type ToolAsk = string

type Args = Record<string, unknown>
type Spec = { kind: WorkStepKind; verb: string; noun: string | null; ask: ToolAsk; text?: (a: Args) => string; target?: (a: Args, out: unknown) => WorkTarget | null; counts?: boolean }

const str = (v: unknown): string => (typeof v === 'string' ? v : '')
const firstLine = (s: string) => s.split('\n')[0].trim()
const clip = (s: string, n = 80) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)
const pathOf = (a: Args) => str(a.file_path) || str(a.filePath) || str(a.path) || str(a.notebook_path)
const baseName = (p: string) => p.split('/').filter(Boolean).pop() ?? p
const fileTarget = (a: Args): WorkTarget | null => (pathOf(a) ? { type: 'file', path: pathOf(a) } : null)
const quoted = (s: string) => (s ? `"${clip(s, 60)}"` : '')

function taskKeyIn(out: unknown): string | null {
  const o = parseJson(out)
  if (!o || typeof o !== 'object') return null
  const v = o as Record<string, unknown>
  if (typeof v.key === 'string') return v.key
  if (typeof v.taskKey === 'string') return v.taskKey
  const task = v.task as Record<string, unknown> | undefined
  return task && typeof task.key === 'string' ? task.key : null
}
const taskTarget = (a: Args, out: unknown): WorkTarget => ({ type: 'task', id: str(a.taskId) || idIn(out), key: taskKeyIn(out) })
/** The staged name a call loaded: Claude may name it within the plugin the skills are staged in (`<plugin>:<name>`), and a staged name has no colon. */
const skillOf = (a: Args) => {
  const named = str(a.skill) || str(a.name)
  return named.slice(named.lastIndexOf(':') + 1)
}
const skillTarget = (a: Args): WorkTarget | null => (skillOf(a) ? { type: 'skill', name: skillOf(a) } : null)
const boardTarget = (a: Args): WorkTarget | null => (str(a.boardId) ? { type: 'board', id: str(a.boardId) } : null)

function idIn(out: unknown): string | null {
  const o = parseJson(out)
  return o && typeof o === 'object' && typeof (o as Args).id === 'string' ? ((o as Args).id as string) : null
}

export function parseJson(v: unknown): unknown {
  if (typeof v !== 'string') return v
  try { return JSON.parse(v) } catch { return null }
}

const looked = (verb: string, noun: string, ask: string, text?: Spec['text'], counts = false): Spec => ({ kind: 'looked', verb, noun, ask, text, counts })
const changed = (verb: string, noun: string, ask: string, text?: Spec['text'], target?: Spec['target']): Spec => ({ kind: 'changed', verb, noun, ask, text, target })

const SPECS: Record<string, Spec> = {
  read_file: { ...looked('Read', 'file', 'Read files', a => baseName(pathOf(a))), target: fileTarget },
  write_file: changed('Wrote', 'file', 'Create and overwrite files', a => baseName(pathOf(a)), fileTarget),
  edit_file: changed('Edited', 'file', 'Edit files', a => baseName(pathOf(a)), fileTarget),
  glob_files: looked('Searched', 'search', 'Search for files', a => `for files named ${quoted(str(a.pattern))}`),
  grep_files: looked('Searched', 'search', 'Search inside files', a => `${quoted(str(a.pattern))}${pathOf(a) ? ` in ${pathOf(a)}` : ''}`),
  list_files: looked('Listed', 'folder', 'List folders', a => pathOf(a) || 'the folder'),
  bash: { kind: 'ran', verb: 'Ran', noun: 'command', ask: 'Run commands', text: a => clip(firstLine(str(a.command)), 120) },
  web_fetch: looked('Fetched', 'web page', 'Fetch a web page', a => str(a.url)),
  web_search: looked('Searched the web for', 'search', 'Search the web', a => quoted(str(a.query))),
  todo: { kind: 'thought', verb: 'Planned', noun: null, ask: 'Keep a to-do list', text: () => 'its next steps' },
  skill: { kind: 'other', verb: 'Used the skill', noun: null, ask: 'Use skills', text: skillOf, target: skillTarget },
  subagent: { kind: 'other', verb: 'Handed part of the work to a helper', noun: null, ask: 'Hand work to a helper', text: a => str(a.description) },

  list_tasks: looked('Listed', 'task', 'List tasks', () => 'tasks', true),
  fetch_my_queued_tasks: looked('Listed', 'task', 'See its queued tasks', () => 'its queued tasks', true),
  get_task_details: { ...looked('Read', 'task', 'Read tasks', () => 'a task'), target: taskTarget },
  create_task: changed('Created', 'task', 'Create tasks', a => str(a.title), taskTarget),
  update_task: changed('Changed', 'task', 'Change tasks', a => str(a.title) || 'a task', taskTarget),
  tick_subtask: changed('Ticked', 'task', 'Tick subtasks', a => str(a.subtaskTitle), taskTarget),
  set_result: changed('Stated the result', 'result', "State a run's result", a => clip(firstLine(str(a.result)))),
  add_comment: changed('Commented on', 'task', 'Comment on tasks', () => 'a task', taskTarget),
  attach_file: changed('Attached', 'task', 'Attach files to tasks', a => str(a.filename) || str(a.name), taskTarget),
  archive_task: changed('Archived', 'task', 'Archive tasks', () => 'a task', taskTarget),
  delete_task: changed('Deleted', 'task', 'Delete tasks', () => 'a task', taskTarget),
  set_task_schedule: changed('Scheduled', 'task', 'Schedule tasks', () => 'a task', taskTarget),
  run_task: changed('Started', 'task', 'Start tasks', () => 'a task', taskTarget),
  create_routine: changed('Created the routine', 'routine', 'Create routines', a => str(a.title)),
  update_routine: changed('Changed', 'routine', 'Change routines', () => 'a routine'),
  list_boards: looked('Listed', 'board', 'List boards', () => 'boards', true),
  get_board: { ...looked('Looked at', 'board', 'Read boards', () => 'a board'), target: a => boardTarget(a) },
  create_board: changed('Created the board', 'board', 'Create boards', a => str(a.name), a => boardTarget(a)),
  rename_sprint: changed('Renamed', 'board', 'Rename sprints', () => 'a sprint', a => boardTarget(a)),
  finish_sprint: changed('Finished', 'board', 'Finish sprints', () => 'a sprint', a => boardTarget(a)),
  list_milestones: looked('Listed', 'milestone', 'List milestones', () => 'milestones', true),
  create_milestone: changed('Created the milestone', 'milestone', 'Create milestones', a => str(a.name) || str(a.title)),
  update_milestone: changed('Changed', 'milestone', 'Change milestones', () => 'a milestone'),
  delete_milestone: changed('Deleted', 'milestone', 'Delete milestones', () => 'a milestone'),
  list_projects: looked('Listed', 'project', 'List projects', () => 'projects', true),
  create_project: changed('Created the project', 'project', 'Create projects', a => str(a.name)),
  list_products: looked('Listed', 'product', 'List products', () => 'products', true),
  get_product: looked('Looked at', 'product', 'Read products', () => 'a product'),
  create_product: changed('Created the product', 'product', 'Create products', a => str(a.name)),
  update_product: changed('Changed', 'product', 'Change products', () => 'a product'),
  delete_product: changed('Deleted', 'product', 'Delete products', () => 'a product'),
  list_agents: looked('Listed', 'agent', 'List agents', () => 'agents', true),
  create_agent: changed('Created the agent', 'agent', 'Create agents', a => str(a.name)),
  list_presets: looked('Listed', 'image', 'List preset images', () => 'preset images'),
  apply_agent_preset: changed('Changed', 'agent', "Change agents' pictures", () => "an agent's picture"),
  get_org: looked('Looked at', 'organisation', 'Read the organisation', () => 'the organisation'),
  update_org: changed('Changed', 'organisation', 'Change the organisation', () => 'the organisation'),
  list_teams: looked('Listed', 'team', 'List teams', () => 'teams', true),
  create_team: changed('Created the team', 'team', 'Create teams', a => str(a.name)),
  list_active_runs: looked('Looked at', 'run', 'See what is running', () => 'what is running'),
  list_workforce_templates: looked('Listed', 'template', 'List workforce templates', () => 'workforce templates'),
  propose_workforce_template: changed('Proposed', 'template', 'Propose workforce templates', () => 'a workforce template'),
  get_github_config: looked('Looked at', 'setting', 'Read the GitHub settings', () => 'the GitHub settings'),
  remember: changed('Remembered', 'memory', 'Remember things about you', a => clip(str(a.fact) || str(a.content) || str(a.text))),
  forget: changed('Forgot', 'memory', 'Forget things about you', () => 'something'),
  start_preview: { kind: 'ran', verb: 'Started', noun: 'preview', ask: 'Start a preview', text: () => 'a preview' },
  stop_processes: { kind: 'ran', verb: 'Stopped', noun: null, ask: 'Stop its processes', text: () => 'its processes' },
  ping: { kind: 'other', verb: 'Checked', noun: null, ask: 'Check the connection', text: () => 'the connection' },
  get_site_info: looked('Looked at', 'site', 'Read the site', () => 'the site'),
  // A knowledge page is named with its level (`website-rebuild:processes/release.md`), as the agent read it.
  search_knowledge: looked('Searched knowledge for', 'search', 'Search knowledge', a => quoted(str(a.pattern))),
  read_knowledge: looked('Read the page', 'page', 'Read knowledge', a => str(a.page)),
  write_knowledge: changed('Wrote the page', 'page', 'Write knowledge pages', a => str(a.page)),
  edit_knowledge: changed('Edited the page', 'page', 'Edit knowledge pages', a => str(a.page)),
  delete_knowledge: changed('Deleted the page', 'page', 'Delete knowledge pages', a => str(a.page)),

  [COMMIT_TOOL_NAME]: changed('Committed', 'commit', 'Commit its changes', a => clip(firstLine(str(a.message)), 120)),
  [MERGE_TOOL_NAME]: changed('Merged the branch into main', 'branch', 'Merge its branch into main', () => 'its branch'),
  [UPDATE_TOOL_NAME]: changed('Brought main into the branch', 'branch', 'Bring main into its branch', () => 'its branch'),
  [START_APP_TOOL]: { kind: 'ran', verb: 'Started', noun: 'app', ask: 'Start an app in the live preview', text: a => str(a.name) || 'an app' },
  [STOP_APP_TOOL]: { kind: 'ran', verb: 'Stopped', noun: 'app', ask: 'Stop an app in the live preview', text: a => str(a.name) || 'an app' },
  [LIST_APPS_TOOL]: looked('Listed', 'app', 'List the apps in the live preview', () => 'apps', true),
  [RELOAD_VIEW_TOOL]: { kind: 'ran', verb: 'Reloaded', noun: null, ask: 'Reload the live preview', text: () => 'the live preview' },
  [SET_AUTO_RELOAD_TOOL]: { kind: 'ran', verb: 'Changed', noun: null, ask: "Change the live preview's automatic reload", text: () => 'automatic reload' },
  // The two package tools are named by the site (`site/src/server/mcp/previewInstallTools.ts`), which core cannot import.
  install_packages: { kind: 'ran', verb: 'Installed', noun: 'package', ask: 'Install packages in the live preview', text: () => 'packages' },
  ask_to_use_package: { kind: 'asked', verb: 'Asked to use', noun: null, ask: 'Ask to use a package', text: a => str(a.name) || 'a package' },
  [WORKFLOW_TOOL_NAMES.list]: looked('Listed', 'workflow', 'List workflows', () => 'workflows', true),
  [WORKFLOW_TOOL_NAMES.propose]: changed('Proposed', 'workflow', 'Propose workflows', a => str(a.name) || 'a workflow'),
  [WORKFLOW_TOOL_NAMES.run]: { kind: 'ran', verb: 'Ran the workflow', noun: 'workflow', ask: 'Run workflows', text: a => str(a.name) || str(a.workflow) },
  [WORKFLOW_TOOL_NAMES.runState]: looked('Checked', 'workflow run', 'Check on workflow runs', () => 'a workflow run'),
  [PROPOSE_SKILL_TOOL]: changed('Proposed the skill', 'skill', 'Propose skills', a => str(a.name)),
}

/** Harness names for the same tools. */
const ALIASES: Record<string, string> = {
  Read: 'read_file', read: 'read_file', NotebookRead: 'read_file',
  Write: 'write_file', write: 'write_file',
  Edit: 'edit_file', MultiEdit: 'edit_file', NotebookEdit: 'edit_file', edit: 'edit_file', apply_patch: 'edit_file', patch: 'edit_file',
  Glob: 'glob_files', glob: 'glob_files',
  Grep: 'grep_files', grep: 'grep_files',
  LS: 'list_files', list: 'list_files',
  Bash: 'bash',
  WebFetch: 'web_fetch', webfetch: 'web_fetch',
  WebSearch: 'web_search', websearch: 'web_search',
  TodoWrite: 'todo', todowrite: 'todo', todoread: 'todo',
  Skill: 'skill',
  Task: 'subagent', task: 'subagent', Agent: 'subagent',
}

/** The one name a call is read under, whichever harness made it. */
export function canonicalToolName(name: string): string {
  const bare = name.replace(/^mcp__.+?__/, '')
  return ALIASES[bare] ?? bare
}

function itemCount(out: unknown): number {
  const o = parseJson(out)
  if (Array.isArray(o)) return o.length
  if (o && typeof o === 'object') {
    const arr = Object.values(o as Args).find(Array.isArray)
    if (arr) return (arr as unknown[]).length
  }
  return 1
}

/** A tool call as one step; `output` is read only to count a listing and find a created task's key. */
export function toolStep(toolName: string, input: unknown, output?: unknown): ToolStep {
  const spec = SPECS[canonicalToolName(toolName)]
  if (!spec) return { kind: 'other', verb: 'Used a tool', text: '', noun: null, count: 1, target: null }
  const args = (input && typeof input === 'object' ? input : {}) as Args
  return {
    kind: spec.kind,
    verb: spec.verb,
    text: spec.text?.(args) ?? '',
    noun: spec.noun,
    count: spec.counts ? itemCount(output) : 1,
    target: spec.target?.(args, output) ?? null,
  }
}

/** What a person is asked to allow for a tool, as an action ("Fetch a web page"). */
export function toolAsk(toolName: string): string {
  return SPECS[canonicalToolName(toolName)]?.ask ?? 'Use a tool it is not yet allowed'
}
