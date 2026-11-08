/**
 * DRAFT: the agents' task, board, sprint and routine tools against the new model (spec *What changes*, Agents'
 * tools). Names, arguments and descriptions, declared once so hq's validator and the site's forwarded copy can be
 * built from the same words when phases 4 to 8 replace today's tools. The wording is not final: it is checked on the
 * baseline model in phase 6 before any of it is served.
 *
 * Who asks is never an argument: hq takes the person from the run's on-behalf-of record, and the project from the
 * run where a tool acts inside it. Core carries no schema library, so each argument is described plainly.
 */
import { TASK_STATES } from './taskModel.js'
import { EXECUTION_STATES } from './executionState.js'
import { BOARD_KINDS } from './boardModel.js'

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
}

export type TaskToolDeclaration = {
  name: TaskToolName
  description: string
  args: Record<string, TaskToolArg>
  /** Until the wording is checked on the baseline model (phase 6). */
  draft: true
}

const opt = (a: Omit<TaskToolArg, 'optional'>): TaskToolArg => ({ ...a, optional: true })
const clearable = (a: Omit<TaskToolArg, 'optional' | 'nullable'>): TaskToolArg => ({ ...a, optional: true, nullable: true })

const PROJECT = { type: 'string', description: 'The project, by its id' } as const
const TASK = { type: 'string', description: 'The task, by its id' } as const
const STATE = {
  type: 'string', values: TASK_STATES,
  description: 'Its task state: BACKLOG (wanted, not committed to), TODO, IN_PROGRESS or DONE. It lands on its type\'s default column for that state',
} as const
const COLUMN = { type: 'string', description: 'One of its type\'s columns, by its id. Sets its state too: each column sits in one state' } as const
const SPRINT = { type: 'string', description: 'A sprint of the project, by its id. A task in Backlog added to a sprint moves to To do' } as const
const FIELDS = {
  type: 'stringMap',
  description: 'Custom field values: each field\'s id mapped to one of its options\' ids, or to an empty string to clear it. Fields never change the task state',
} as const
const PLAN_DAY = 'the day (YYYY-MM-DD), or null to clear. Moves no work'
const CRON = {
  type: 'string', maxLength: 120,
  description: 'When it runs, as a cron rule of five fields: minute hour day-of-month month day-of-week, such as "0 9 * * 1-5" for weekdays at 9:00. No more often than every 5 minutes',
} as const
const TIMEZONE = { type: 'string', description: 'IANA timezone the cron rule is read in, such as Europe/London. Omit it for the timezone of the person you work for' } as const

const TASK_FIELDS: Record<string, TaskToolArg> = {
  title: opt({ type: 'string', maxLength: 200, description: 'Its title' }),
  description: opt({ type: 'string', description: 'What and why, in Markdown' }),
  typeId: opt({ type: 'string', description: 'One of the project\'s task types, by its id. Changing the type keeps the task state' }),
  columnId: opt(COLUMN),
  state: opt(STATE),
  sprintId: clearable(SPRINT),
  epicId: clearable({ type: 'string', description: 'The epic it belongs to (a task of type Epic), or null to take it out' }),
  assignedAgentId: clearable({ type: 'string', description: 'The agent that does it, or null for none. Assigning starts nothing' }),
  priority: opt({ type: 'string', values: ['low', 'medium', 'high'], description: 'Its priority' }),
  labels: opt({ type: 'stringList', description: 'The full list of its labels' }),
  planStart: clearable({ type: 'string', description: `Plan: when the work is meant to start, ${PLAN_DAY}` }),
  planFinish: clearable({ type: 'string', description: `Plan: when the work is meant to finish, ${PLAN_DAY}` }),
  workspaceId: clearable({ type: 'string', description: 'One of the project\'s workspaces for it to work in, or null for the project\'s files' }),
  fieldValues: opt(FIELDS),
}

const BOARD_REF: Record<string, TaskToolArg> = {
  projectId: PROJECT,
  boardId: opt({ type: 'string', description: 'A saved board, by its id. Omit it for a built-in board, named by kind' }),
  kind: opt({ type: 'string', values: ['STATE', 'EXECUTION'], description: 'A built-in board: STATE (every type, by task state) or EXECUTION (what agents are doing)' }),
}

export const TASK_TOOL_DECLARATIONS: TaskToolDeclaration[] = [
  {
    name: 'list_tasks',
    description:
      'List tasks in a project, in its order (rank): the order agents take ready tasks in. Filter by type, task state, ' +
      'execution state, sprint, epic, agent or a custom field\'s option.',
    args: {
      projectId: PROJECT,
      typeId: opt({ type: 'string', description: 'Only tasks of this type' }),
      state: opt({ ...STATE, description: 'Only tasks in this task state' }),
      executionState: opt({ type: 'string', values: EXECUTION_STATES, description: 'Only tasks whose run is in this state. Set by the system only' }),
      sprintId: opt({ type: 'string', description: 'Only tasks in this sprint, or "current" for the current sprint' }),
      epicId: opt({ type: 'string', description: 'Only tasks of this epic' }),
      assignedAgentId: opt({ type: 'string', description: 'Only tasks this agent does' }),
      optionId: opt({ type: 'string', description: 'Only tasks with this custom field option' }),
      includeArchived: opt({ type: 'boolean', description: 'Include archived tasks (default false)' }),
      limit: opt({ type: 'number', description: 'At most this many (default 50)' }),
    },
    draft: true,
  },
  {
    name: 'create_task',
    description:
      'Create a task. It starts in Backlog on its type\'s Backlog column unless you name a column or a state, and goes ' +
      'last in the project\'s order. Creating a task never starts it: use run_task when the person you work for asked for that.',
    args: { projectId: PROJECT, ...TASK_FIELDS, title: { type: 'string', maxLength: 200, description: 'Its title' } },
    draft: true,
  },
  {
    name: 'update_task',
    description:
      'Change one task: its fields, its column or state, its sprint, epic or agent, or its place in the project\'s order. ' +
      'A finished run does not move a task: move it to Done when the work is done.',
    args: {
      taskId: TASK,
      ...TASK_FIELDS,
      afterTaskId: opt({ type: 'string', description: 'Put it right after this task in the project\'s order' }),
      beforeTaskId: opt({ type: 'string', description: 'Put it right before this task in the project\'s order' }),
      archived: opt({ type: 'boolean', description: 'true archives it, false brings it back' }),
    },
    draft: true,
  },
  {
    name: 'change_tasks',
    description: 'Change several tasks of one project at once, the same way: move them to a state, a sprint, an epic or an agent, or archive them.',
    args: {
      taskIds: { type: 'stringList', description: 'The tasks, by id: at most 100, all in one project' },
      state: opt(STATE),
      sprintId: clearable(SPRINT),
      epicId: clearable({ type: 'string', description: 'The epic they belong to, or null to take them out' }),
      assignedAgentId: clearable({ type: 'string', description: 'The agent that does them, or null for none' }),
      archived: opt({ type: 'boolean', description: 'true archives them' }),
    },
    draft: true,
  },
  {
    name: 'run_task',
    description:
      'Start a task, or set when it starts. Only when the person you work for asked you to. It joins its agent\'s line: ' +
      'each agent does one task at a time, in the project\'s order. Answers at once and never waits for the run to end. ' +
      'An epic is never run.',
    args: {
      taskId: TASK,
      at: opt({ type: 'string', description: 'ISO 8601 time to start it (Run at…). With no offset it is read in the timezone of the person you work for' }),
    },
    draft: true,
  },
  {
    name: 'list_boards',
    description: 'List a project\'s boards: the two built in (task state, execution) and its saved ones, each a way of looking at the same tasks.',
    args: { projectId: PROJECT },
    draft: true,
  },
  {
    name: 'get_board',
    description: 'Read a board: its columns, in order, and the tasks in each, in the project\'s order. A board holds no tasks of its own.',
    args: BOARD_REF,
    draft: true,
  },
  {
    name: 'open_board',
    description: 'Show a board to the person beside this conversation, so you can talk it through together.',
    args: BOARD_REF,
    draft: true,
  },
  {
    name: 'create_board',
    description:
      'Save a board: a view of the project\'s tasks by one type\'s columns, by the task state, by the execution state, ' +
      'or by a custom field\'s options, with an optional filter. It moves no task.',
    args: {
      projectId: PROJECT,
      name: { type: 'string', maxLength: 80, description: 'Its name' },
      kind: { type: 'string', values: BOARD_KINDS, description: 'TYPE (one type\'s columns), STATE, EXECUTION, or FIELD (a custom field\'s options)' },
      typeId: opt({ type: 'string', description: 'For TYPE: the type' }),
      fieldId: opt({ type: 'string', description: 'For FIELD: the custom field' }),
      sprintId: opt({ type: 'string', description: 'Filter: only this sprint\'s tasks, or "current" for whichever sprint is current' }),
      epicId: opt({ type: 'string', description: 'Filter: only this epic\'s tasks' }),
      agentId: opt({ type: 'string', description: 'Filter: only this agent\'s tasks' }),
    },
    draft: true,
  },
  {
    name: 'finish_sprint',
    description:
      'Finish the project\'s current sprint and start the next, with the same length. You must say where its unfinished ' +
      'tasks go: "next" (the next sprint) or "none" (no sprint; their state stays). Ask the person you work for if they have not said.',
    args: {
      projectId: PROJECT,
      unfinished: { type: 'string', values: ['next', 'none'], description: 'Where the unfinished tasks go' },
    },
    draft: true,
  },
  {
    name: 'rename_sprint',
    description: 'Rename a sprint. Its number stays: "Sprint 12 · Pricing push".',
    args: {
      sprintId: { type: 'string', description: 'The sprint' },
      name: { type: 'string', nullable: true, maxLength: 80, description: 'Its new name, or null for none' },
    },
    draft: true,
  },
  {
    name: 'create_routine',
    description:
      'Set up a routine: an agent runs the same instructions on a schedule. Each time it starts one run; it creates no ' +
      'task unless its instructions say to. Only when the person you work for asked you to; it runs on their behalf.',
    args: {
      projectId: PROJECT,
      title: { type: 'string', maxLength: 120, description: 'Its name' },
      agentId: { type: 'string', description: 'The agent that runs it' },
      instructions: { type: 'string', maxLength: 20_000, description: 'What the agent does each time, in Markdown' },
      cron: CRON,
      timezone: opt(TIMEZONE),
      modelChoice: opt({ type: 'string', description: 'The model each run uses, as provider/model; omit for the agent\'s own' }),
    },
    draft: true,
  },
  {
    name: 'update_routine',
    description:
      'Change a routine, or switch it on or off. Any change makes it run on behalf of the person you work for from then ' +
      'on. Only when they asked you to.',
    args: {
      routineId: { type: 'string', description: 'The routine' },
      title: opt({ type: 'string', maxLength: 120, description: 'Its name' }),
      agentId: opt({ type: 'string', description: 'The agent that runs it' }),
      instructions: opt({ type: 'string', maxLength: 20_000, description: 'What the agent does each time' }),
      cron: opt(CRON),
      timezone: opt(TIMEZONE),
      modelChoice: clearable({ type: 'string', description: 'The model each run uses, or null for the agent\'s own' }),
      enabled: opt({ type: 'boolean', description: 'false switches it off, true on' }),
    },
    draft: true,
  },
]
