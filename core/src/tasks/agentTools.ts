/**
 * The agents' task, board, sprint and routine tools against the new model (spec *What changes*, Agents' tools):
 * names, arguments and descriptions, declared once so hq's validator and the site's forwarded copy are built from the
 * same words and cannot drift.
 *
 * Every one is served. Work starts only by an explicit act (adr-0175): who a run is for, and that work starts only
 * when the person asked, is said once, in the platform tools' instructions (`TASK_MODEL_CONCEPTS`); each tool says
 * what else it refuses.
 *
 * Who asks is never an argument: hq takes the person from the run's on-behalf-of record, and the project from the
 * run where a tool acts inside it. Core carries no schema library, so each argument is described plainly.
 */
import { TASK_STATES } from './taskModel.js'
import { EXECUTION_STATES } from './executionState.js'
import { BOARD_KINDS } from './boardModel.js'
import type { ToolArea } from '../harness/toolAreas.js'

export const TASK_TOOL_NAMES = [
  'list_tasks', 'create_task', 'update_task', 'change_tasks', 'run_task',
  'list_boards', 'get_board', 'open_board', 'create_board',
  'finish_sprint', 'rename_sprint',
  'create_routine', 'update_routine',
] as const
export type TaskToolName = (typeof TASK_TOOL_NAMES)[number]

export type TaskToolArg = {
  type: 'string' | 'number' | 'boolean' | 'stringList' | 'stringMap'
  description: string
  /** A closed set of values for a string. */
  values?: readonly string[]
  optional?: true
  /** null is accepted, and clears the value. */
  nullable?: true
  maxLength?: number
  /** The most entries a list may hold. */
  maxItems?: number
}

export type TaskToolDeclaration = {
  name: TaskToolName
  area: ToolArea
  description: string
  args: Record<string, TaskToolArg>
}

/** The most tasks one change_tasks call changes. */
export const CHANGE_TASKS_MAX = 100
/** The most tasks list_tasks answers in one call. */
export const LIST_TASKS_MAX = 200
export const TASK_TITLE_MAX_LENGTH = 200
/** hq's limits on a saved board's and a sprint's name; hq's tests hold them to its own. */
const SAVED_BOARD_NAME_MAX_LENGTH = 60
const SPRINT_NAME_MAX_LENGTH = 120

const opt = (a: Omit<TaskToolArg, 'optional'>): TaskToolArg => ({ ...a, optional: true })
const clearable = (a: Omit<TaskToolArg, 'optional' | 'nullable'>): TaskToolArg => ({ ...a, optional: true, nullable: true })

// The words of the arguments the task tools share, exported so a conversation's own task tools pick them, never
// copy them. Ids of types, columns, sprints and custom fields come from list_boards, which each tool says once.
export const PROJECT_ARG: TaskToolArg = { type: 'string', description: 'The project\'s key (such as WEB) or id' }
export const TASK_ARG: TaskToolArg = { type: 'string', description: 'The task\'s key (such as WEB-14) or id' }
export const STATE_ARG: TaskToolArg = {
  type: 'string', values: TASK_STATES,
  description: 'Its task state; BACKLOG is wanted, not committed to. It lands on its type\'s default column for it',
}
export const COLUMN_ARG: TaskToolArg = { type: 'string', description: 'A column of its type, by id. Sets its state too' }
const SPRINT: TaskToolArg = { type: 'string', description: 'A sprint of the project, by id, or null for none' }
const EPIC: TaskToolArg = { type: 'string', description: 'Its epic, by key or id, or null for none' }
export const AGENT_ARG: TaskToolArg = { type: 'string', description: 'The agent that does it, by id, or null for none. It must be in the project' }
const CRON = {
  type: 'string', maxLength: 120,
  description: 'A cron rule of five fields (minute hour day-of-month month day-of-week), such as "0 9 * * 1-5" for weekdays at 9:00. At most every 5 minutes',
} as const
const TIMEZONE = {
  type: 'string',
  description: 'The IANA timezone the rule is read in, such as Europe/London. Default: the person\'s you work for, else UTC; the answer says which',
} as const
const ROUTINE_TITLE_MAX_LENGTH = 120
const ROUTINE_INSTRUCTIONS_MAX_LENGTH = 20_000
const LIST_BOARDS_IDS = 'Ids of types, columns, sprints and custom fields come from list_boards.'

/** The fields create_task and update_task share. */
export const TASK_FIELDS: Record<string, TaskToolArg> = {
  title: opt({ type: 'string', maxLength: TASK_TITLE_MAX_LENGTH, description: 'Its title' }),
  description: opt({ type: 'string', description: 'What and why, in Markdown' }),
  typeId: opt({ type: 'string', description: 'A task type of the project, by id. Changing it keeps the task state' }),
  columnId: opt(COLUMN_ARG),
  state: opt(STATE_ARG),
  sprintId: clearable(SPRINT),
  epicId: clearable(EPIC),
  assignedAgentId: clearable(AGENT_ARG),
  priority: opt({ type: 'string', values: ['low', 'medium', 'high'], description: 'Its priority' }),
  labels: opt({ type: 'stringList', description: 'All its labels' }),
  planStart: clearable({ type: 'string', description: 'The day its work is planned to start, YYYY-MM-DD, or null' }),
  planFinish: clearable({ type: 'string', description: 'The day its work is planned to finish, YYYY-MM-DD, or null' }),
  milestoneId: clearable({ type: 'string', description: 'An epic\'s milestone, by id (list_milestones lists them), or null. Only an epic has one' }),
  workspaceId: clearable({ type: 'string', description: 'A workspace of the project to work in, or null for the project\'s files' }),
  fieldValues: opt({ type: 'stringMap', description: 'Custom field ids mapped to an option\'s id, or to "" to clear' }),
}

const BOARD_REF: Record<string, TaskToolArg> = {
  projectId: PROJECT_ARG,
  boardId: opt({ type: 'string', description: 'A saved board, by id (list_boards lists them). Omit it for a built-in board' }),
  kind: opt({ type: 'string', values: ['STATE', 'EXECUTION'], description: 'A built-in board: STATE (by task state) or EXECUTION (what agents are doing). Not with boardId' }),
}

export const TASK_TOOL_DECLARATIONS: TaskToolDeclaration[] = [
  {
    name: 'list_tasks',
    area: 'tasks',
    description:
      'List a project\'s tasks in its order, each with its key, type, column, task state, execution state, agent, ' +
      'sprint and epic, filtered by any of those or a custom field option. Archived tasks only if you ask.',
    args: {
      projectId: PROJECT_ARG,
      typeId: opt({ type: 'string', description: 'Only this type\'s tasks, by id' }),
      state: opt({ ...STATE_ARG, description: 'Only tasks in this task state' }),
      executionState: opt({ type: 'string', values: EXECUTION_STATES, description: 'Only tasks whose run is in this state' }),
      sprintId: opt({ type: 'string', description: 'Only this sprint\'s tasks, by id, or "current"' }),
      epicId: opt({ type: 'string', description: 'Only this epic\'s tasks, by key or id' }),
      assignedAgentId: opt({ type: 'string', description: 'Only this agent\'s tasks, by id' }),
      optionId: opt({ type: 'string', description: 'Only tasks with this custom field option, by id' }),
      includeArchived: opt({ type: 'boolean', description: 'true includes archived tasks' }),
      limit: opt({ type: 'number', description: `At most this many (default 50, at most ${LIST_TASKS_MAX})` }),
    },
  },
  {
    name: 'create_task',
    area: 'tasks',
    description:
      'Create a task in a project, last in its order. It lands in Backlog unless you name a column or a state, and ' +
      `is of the type Task unless you name another. ${LIST_BOARDS_IDS} It starts only if you pass queue: true.`,
    args: {
      projectId: PROJECT_ARG, ...TASK_FIELDS, title: { type: 'string', maxLength: TASK_TITLE_MAX_LENGTH, description: 'Its title' },
      queue: opt({
        type: 'boolean',
        description:
          'true also starts it, as run_task does. Refused for the same reasons as run_task: the task is still made, ' +
          'not started, and the answer says why',
      }),
    },
  },
  {
    name: 'update_task',
    area: 'tasks',
    description:
      'Change one task: its fields, type, column or task state, sprint, epic, agent, custom fields, or place in the ' +
      `project's order. ${LIST_BOARDS_IDS} Move it to Done when its work is done. Refused for a task outside your ` +
      'project, or a column not of its type.',
    args: {
      taskId: TASK_ARG,
      ...TASK_FIELDS,
      afterTaskId: opt({ type: 'string', description: 'Put it right after this task in the order, by key or id' }),
      beforeTaskId: opt({ type: 'string', description: 'Put it right before this task in the order, by key or id. Not with afterTaskId' }),
      archived: opt({ type: 'boolean', description: 'true archives it, false brings it back' }),
      modelChoice: clearable({ type: 'string', description: 'The model its runs use, as provider/model, or null for its agent\'s. Only when the person names one' }),
    },
  },
  {
    name: 'change_tasks',
    area: 'tasks',
    description:
      `Change up to ${CHANGE_TASKS_MAX} tasks of one project the same way: their task state, sprint, epic or agent, ` +
      'or archive them. Each is changed on its own: the answer says which were changed, and why any were not.',
    args: {
      taskIds: { type: 'stringList', maxItems: CHANGE_TASKS_MAX, description: 'The tasks, by key or id, all in one project' },
      state: opt(STATE_ARG),
      sprintId: clearable({ ...SPRINT, description: 'A sprint of the project, by id (list_boards lists them), or null for none' }),
      epicId: clearable({ ...EPIC, description: 'Their epic, by key or id, or null for none' }),
      assignedAgentId: clearable({ ...AGENT_ARG, description: 'The agent that does them, by id, or null for none' }),
      archived: opt({ type: 'boolean', description: 'true archives them, false brings them back' }),
    },
  },
  {
    name: 'run_task',
    area: 'tasks',
    description:
      'Start a task now. It joins its agent\'s line (an agent does one task at a time in a project, in its order), ' +
      'so it runs now or when that agent\'s running task ends. Answers at once; the task\'s execution state shows how ' +
      'it goes. Refused for the task this run is working on, an epic, an archived task, a task with no agent, one ' +
      'already running, failed or needing a person, one with a start time still to come, and a start deeper in a ' +
      'chain of work agents started for each other than the organisation allows. To start it later, use ' +
      'set_task_schedule.',
    args: { taskId: TASK_ARG },
  },
  {
    name: 'list_boards',
    area: 'planning',
    description:
      'List a project\'s boards (STATE and EXECUTION, built in, and its saved ones) with the tasks in each column, ' +
      'and the ids of its task types and their columns, its custom fields and their options, and its sprints.',
    args: { projectId: PROJECT_ARG },
  },
  {
    name: 'get_board',
    area: 'planning',
    description:
      'Read a board: its columns in order and the tasks in each. A board holds no tasks: to move a card, change the ' +
      'task with update_task. The EXECUTION board is not moved.',
    args: BOARD_REF,
  },
  {
    name: 'open_board',
    area: 'planning',
    description: 'Show a board to the person as a card in this conversation that opens it. It changes nothing.',
    args: BOARD_REF,
  },
  {
    name: 'create_board',
    area: 'planning',
    description:
      'Save a board for the project: its tasks by one type\'s columns (TYPE), by task state (STATE), by what agents ' +
      'are doing (EXECUTION) or by a custom field\'s options (FIELD), with an optional filter. It moves no task. ' +
      'Names are unique in a project.',
    args: {
      projectId: PROJECT_ARG,
      name: { type: 'string', maxLength: SAVED_BOARD_NAME_MAX_LENGTH, description: 'Its name' },
      kind: { type: 'string', values: BOARD_KINDS, description: 'What it is arranged by' },
      typeId: opt({ type: 'string', description: 'For TYPE: the type, by id' }),
      fieldId: opt({ type: 'string', description: 'For FIELD: the custom field, by id' }),
      sprintId: opt({ type: 'string', description: 'Filter: only this sprint\'s tasks, by id, or "current"' }),
      epicId: opt({ type: 'string', description: 'Filter: only this epic\'s tasks, by key or id' }),
      agentId: opt({ type: 'string', description: 'Filter: only this agent\'s tasks, by id' }),
    },
  },
  {
    name: 'finish_sprint',
    area: 'planning',
    description:
      'Finish the project\'s current sprint; the next one becomes current. If any of its tasks is not done, say ' +
      'where those go ("next" or "none"), asking the person if they have not said; their task state stays. Refused ' +
      'when the project has no sprints.',
    args: {
      projectId: PROJECT_ARG,
      unfinished: opt({ type: 'string', values: ['next', 'none'], description: 'Where the tasks not done go: the next sprint, or none' }),
    },
  },
  {
    name: 'rename_sprint',
    area: 'planning',
    description: 'Rename a sprint. Its number stays: "Sprint 12 · Pricing push".',
    args: {
      sprintId: { type: 'string', description: 'The sprint, by id (list_boards lists them)' },
      name: { type: 'string', nullable: true, maxLength: SPRINT_NAME_MAX_LENGTH, description: 'Its new name, or null for none' },
    },
  },
  {
    name: 'create_routine',
    area: 'tasks',
    description:
      'Set up a routine in a project: on a schedule, an agent runs the same instructions, each time as a run of its ' +
      'own. It owns no task, runs on behalf of the person you work for, with their access, and is on once made. A ' +
      'firing while its last run is still going is skipped. Refused in a run of a routine, where the project does ' +
      'not let agents set schedules, for an agent not in the project, a schedule more often than every 5 minutes, ' +
      'or a model not allowed there. For one task at one time, use set_task_schedule.',
    args: {
      projectId: PROJECT_ARG,
      title: { type: 'string', maxLength: ROUTINE_TITLE_MAX_LENGTH, description: 'Its name' },
      agentId: { type: 'string', description: 'The agent that runs it, by id (list_agents lists them). It must be in the project' },
      instructions: { type: 'string', maxLength: ROUTINE_INSTRUCTIONS_MAX_LENGTH, description: 'What the agent does each time, in Markdown: all a run needs, since each starts from these alone' },
      cron: CRON,
      timezone: opt(TIMEZONE),
      modelChoice: opt({ type: 'string', description: 'The model each run uses, as provider/model; omit it for the agent\'s own' }),
    },
  },
  {
    name: 'update_routine',
    area: 'tasks',
    description:
      'Change a routine, or switch it on or off; pass only what changes. Any change, switching it on or off ' +
      'included, makes it run on behalf of the person you work for from then on: tell them before you change one ' +
      'someone else set up. A new schedule, or switching it on, sets its next run. Refused as create_routine is.',
    args: {
      routineId: { type: 'string', description: 'The routine, by id' },
      title: opt({ type: 'string', maxLength: ROUTINE_TITLE_MAX_LENGTH, description: 'Its new name' }),
      agentId: opt({ type: 'string', description: 'The agent that runs it, by id. It must be in the project' }),
      instructions: opt({ type: 'string', maxLength: ROUTINE_INSTRUCTIONS_MAX_LENGTH, description: 'Its instructions in full, replacing the old' }),
      cron: opt({ ...CRON, description: 'A new cron rule, as create_routine takes it. Read in the timezone you name, else the person\'s you work for, else the routine\'s own' }),
      timezone: opt({ ...TIMEZONE, description: 'The IANA timezone the rule is read in' }),
      modelChoice: clearable({ type: 'string', description: 'The model each run uses, as provider/model, or null for the agent\'s own' }),
      enabled: opt({ type: 'boolean', description: 'false switches it off, true on' }),
    },
  },
]

/** The tools served: every one declared. */
export const SERVED_TASK_TOOL_DECLARATIONS: TaskToolDeclaration[] = TASK_TOOL_DECLARATIONS

/** open_board shows a board to the person in a conversation: a conversation's own tool, never a run's. */
export const CONVERSATION_ONLY_TASK_TOOLS: ReadonlySet<TaskToolName> = new Set(['open_board'])
