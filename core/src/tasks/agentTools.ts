/**
 * The agents' task, board, sprint and routine tools against the new model (spec *What changes*, Agents' tools):
 * names, arguments and descriptions, declared once so hq's validator and the site's forwarded copy are built from the
 * same words and cannot drift.
 *
 * Every one is served. Work starts only by an explicit act (adr-0175), and each tool that starts work or makes a routine
 * says who the run is for and what it refuses.
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
  /** The most entries a list may hold. */
  maxItems?: number
}

export type TaskToolDeclaration = {
  name: TaskToolName
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

const PROJECT = { type: 'string', description: 'The project: its key (such as WEB) or its id' } as const
const TASK = { type: 'string', description: 'The task: its key (such as WEB-14) or its id' } as const
const STATE = {
  type: 'string', values: TASK_STATES,
  description: 'Its task state: BACKLOG (wanted, not committed to), TODO, IN_PROGRESS or DONE. It lands on its type\'s default column for that state',
} as const
const COLUMN = {
  type: 'string',
  description: 'One of its type\'s columns, by the column\'s id (list_boards lists each type\'s columns). Sets its state too: each column sits in one state',
} as const
const SPRINT = {
  type: 'string',
  description: 'A sprint of the project, by its id (list_boards lists them), or null to take it out of its sprint. A task in Backlog planned into a sprint moves to To do',
} as const
const EPIC = { type: 'string', description: 'The epic it belongs to (a task of the type Epic), by its key or id, or null to take it out' } as const
const AGENT = { type: 'string', description: 'The agent that does it, by its id, or null for none. The agent must be in the project. Assigning starts nothing' } as const
const FIELDS = {
  type: 'stringMap',
  description: 'Custom field values: each field\'s id mapped to one of its options\' ids, or to "" to clear it (list_boards lists the fields and their options). A field never changes the task state',
} as const
const PLAN_DAY = 'the day (YYYY-MM-DD), or null to clear. Moves no work'
const CRON = {
  type: 'string', maxLength: 120,
  description: 'When it runs, as a cron rule of five fields: minute hour day-of-month month day-of-week, such as "0 9 * * 1-5" for weekdays at 9:00. No more often than every 5 minutes',
} as const
const TIMEZONE = {
  type: 'string',
  description: 'IANA timezone the cron rule is read in, such as Europe/London. Omit it for the timezone of the person you work for (UTC if they have none); the answer says which was used',
} as const
const ROUTINE_TITLE_MAX_LENGTH = 120
const ROUTINE_INSTRUCTIONS_MAX_LENGTH = 20_000
/** What every tool that starts work or makes a routine refuses, whoever calls it. */
const ONLY_WHEN_ASKED =
  'Only when the person you work for asked for it: refused in a run no person started (a routine\'s scheduled run, ' +
  'a start time\'s, or one an agent started) and through a connection without its Start work permission'

const TASK_FIELDS: Record<string, TaskToolArg> = {
  title: opt({ type: 'string', maxLength: TASK_TITLE_MAX_LENGTH, description: 'Its title' }),
  description: opt({ type: 'string', description: 'What and why, in Markdown' }),
  typeId: opt({ type: 'string', description: 'One of the project\'s task types, by its id (list_boards lists them). Changing the type keeps the task state' }),
  columnId: opt(COLUMN),
  state: opt(STATE),
  sprintId: clearable(SPRINT),
  epicId: clearable(EPIC),
  assignedAgentId: clearable(AGENT),
  priority: opt({ type: 'string', values: ['low', 'medium', 'high'], description: 'Its priority' }),
  labels: opt({ type: 'stringList', description: 'The full list of its labels' }),
  planStart: clearable({ type: 'string', description: `Plan: when the work is meant to start, ${PLAN_DAY}` }),
  planFinish: clearable({ type: 'string', description: `Plan: when the work is meant to finish, ${PLAN_DAY}` }),
  milestoneId: clearable({ type: 'string', description: 'An epic\'s milestone, by its id (list_milestones lists them), or null to clear. Only an epic has one' }),
  workspaceId: clearable({ type: 'string', description: 'One of the project\'s workspaces for it to work in, or null for the project\'s files' }),
  fieldValues: opt(FIELDS),
}

const BOARD_REF: Record<string, TaskToolArg> = {
  projectId: PROJECT,
  boardId: opt({ type: 'string', description: 'A saved board, by its id (list_boards lists them). Omit it for a built-in board, named by kind' }),
  kind: opt({ type: 'string', values: ['STATE', 'EXECUTION'], description: 'A built-in board: STATE (every type, by task state) or EXECUTION (what agents are doing). Not read with boardId' }),
}

export const TASK_TOOL_DECLARATIONS: TaskToolDeclaration[] = [
  {
    name: 'list_tasks',
    description:
      'List a project\'s tasks in its order (rank), the order agents take ready tasks in, with each task\'s key, type, ' +
      'column, task state, execution state, agent, sprint and epic. Filter by type, task state, execution state, ' +
      'sprint, epic, agent or a custom field\'s option. Archived tasks are left out unless you ask for them.',
    args: {
      projectId: PROJECT,
      typeId: opt({ type: 'string', description: 'Only tasks of this type, by its id' }),
      state: opt({ ...STATE, description: 'Only tasks in this task state: BACKLOG, TODO, IN_PROGRESS or DONE' }),
      executionState: opt({
        type: 'string', values: EXECUTION_STATES,
        description: 'Only tasks whose agent\'s run is in this state. Set by the system, never by you',
      }),
      sprintId: opt({ type: 'string', description: 'Only tasks in this sprint, by its id, or "current" for the current sprint' }),
      epicId: opt({ type: 'string', description: 'Only the tasks of this epic, by its key or id' }),
      assignedAgentId: opt({ type: 'string', description: 'Only tasks this agent does, by its id' }),
      optionId: opt({ type: 'string', description: 'Only tasks with this custom field option, by its id' }),
      includeArchived: opt({ type: 'boolean', description: 'true includes archived tasks (default false)' }),
      limit: opt({ type: 'number', description: `At most this many (default 50, at most ${LIST_TASKS_MAX})` }),
    },
  },
  {
    name: 'create_task',
    description:
      'Create a task in a project. It starts in Backlog on its type\'s Backlog column, unless you name a column or a ' +
      'state, and goes last in the project\'s order. Its type is Task unless you name another. Creating a task never ' +
      'starts it, whatever its column or agent, unless you pass queue: true.',
    args: {
      projectId: PROJECT, ...TASK_FIELDS, title: { type: 'string', maxLength: TASK_TITLE_MAX_LENGTH, description: 'Its title' },
      queue: opt({
        type: 'boolean',
        description:
          'true also starts it once it is made, as run_task does: it joins its agent\'s line and runs when that agent is ' +
          `free. ${ONLY_WHEN_ASKED}; also when it has no agent, is an epic, or would be deeper in a chain of work agents ` +
          'started for each other than the organisation allows. Refused, the task is still made, not started, and the ' +
          'answer says why',
      }),
    },
  },
  {
    name: 'update_task',
    description:
      'Change one task: its fields, its type, column or task state, its sprint, epic or agent, its custom field ' +
      'values, or its place in the project\'s order. A finished run does not move a task: move it to Done when the ' +
      'work is done. Moving a task starts nothing. Refused for a task outside the project you work in, or a column ' +
      'that is not one of its type\'s.',
    args: {
      taskId: TASK,
      ...TASK_FIELDS,
      afterTaskId: opt({ type: 'string', description: 'Put it right after this task in the project\'s order, by its key or id' }),
      beforeTaskId: opt({ type: 'string', description: 'Put it right before this task in the project\'s order, by its key or id. Not with afterTaskId' }),
      archived: opt({ type: 'boolean', description: 'true archives it, false brings it back' }),
    },
  },
  {
    name: 'change_tasks',
    description:
      `Change several tasks of one project at once, the same way: move them to a task state, plan them into a sprint ` +
      `or take them out, set their epic or agent, or archive them. At most ${CHANGE_TASKS_MAX} tasks. Each task is ` +
      'changed on its own: the answer says which were changed, and why any were not.',
    args: {
      taskIds: { type: 'stringList', maxItems: CHANGE_TASKS_MAX, description: `The tasks, by key or id: at most ${CHANGE_TASKS_MAX}, all in one project` },
      state: opt(STATE),
      sprintId: clearable({ ...SPRINT, description: 'A sprint of the project, by its id, or null to take them out of their sprint. Tasks in Backlog planned into a sprint move to To do' }),
      epicId: clearable({ ...EPIC, description: 'The epic they belong to, by its key or id, or null to take them out' }),
      assignedAgentId: clearable({ ...AGENT, description: 'The agent that does them, by its id, or null for none. Assigning starts nothing' }),
      archived: opt({ type: 'boolean', description: 'true archives them, false brings them back' }),
    },
  },
  {
    name: 'run_task',
    description:
      'Start a task now. A task starts only when someone starts it: nothing you create, move or assign starts. It ' +
      'joins its agent\'s line: each agent does one task at a time in a project, in the project\'s order, so it runs ' +
      'now or when that agent\'s running task ends. Answers at once and never waits for the run to end; the task\'s ' +
      'execution state shows how it goes. Through a person\'s connection the run is on their behalf; in your run it ' +
      'is your start, on behalf of the task\'s person, and the run it starts cannot start another task. ' +
      `${ONLY_WHEN_ASKED}. Also refused: the task this run is working on, an epic, an archived task, a task with no ` +
      'agent, one already running, failed or needing a person, one with a start time still to come (it ' +
      'starts then), and a start deeper in a chain of work agents started for each other than the organisation ' +
      'allows. To start it later instead, use set_task_schedule.',
    args: { taskId: TASK },
  },
  {
    name: 'list_boards',
    description:
      'List a project\'s boards, each a way of looking at the same tasks: the two built in (STATE, by task state; ' +
      'EXECUTION, by what agents are doing) and its saved ones, each with how many tasks are in each column. Also ' +
      'lists what tasks are arranged by: the project\'s task types with their columns, its custom fields with their ' +
      'options, and its current and upcoming sprints, each with its id.',
    args: { projectId: PROJECT },
  },
  {
    name: 'get_board',
    description:
      'Read a board: its columns, in order, and the tasks in each, in the project\'s order. A board holds no tasks of ' +
      'its own: moving a card is changing the task, with update_task (its column or state, a custom field value, or ' +
      'its place in the order). The EXECUTION board is not moved: it shows what agents are doing.',
    args: BOARD_REF,
  },
  {
    name: 'open_board',
    description:
      'Show a board to the person you are talking with, as a card in this conversation that opens it, so you can talk ' +
      'it through together. Only in a conversation. It changes nothing.',
    args: BOARD_REF,
  },
  {
    name: 'create_board',
    description:
      'Save a board for everyone in the project: a view of its tasks by one type\'s columns (TYPE), by the task state ' +
      '(STATE), by what agents are doing (EXECUTION), or by a custom field\'s options (FIELD), with an optional ' +
      'filter. It moves no task. Names are unique in a project.',
    args: {
      projectId: PROJECT,
      name: { type: 'string', maxLength: SAVED_BOARD_NAME_MAX_LENGTH, description: 'Its name' },
      kind: { type: 'string', values: BOARD_KINDS, description: 'TYPE (one type\'s columns), STATE, EXECUTION, or FIELD (a custom field\'s options)' },
      typeId: opt({ type: 'string', description: 'For TYPE only: the type, by its id' }),
      fieldId: opt({ type: 'string', description: 'For FIELD only: the custom field, by its id' }),
      sprintId: opt({ type: 'string', description: 'Filter: only this sprint\'s tasks, by its id, or "current" for whichever sprint is current' }),
      epicId: opt({ type: 'string', description: 'Filter: only this epic\'s tasks, by its key or id' }),
      agentId: opt({ type: 'string', description: 'Filter: only this agent\'s tasks, by its id' }),
    },
  },
  {
    name: 'finish_sprint',
    description:
      'Finish the project\'s current sprint; the next one becomes current. While any of its tasks is not done you must ' +
      'say where those go: "next" (the next sprint) or "none" (no sprint); their task state stays either way. Ask the ' +
      'person you work for if they have not said. Refused when the project has no sprints.',
    args: {
      projectId: PROJECT,
      unfinished: opt({ type: 'string', values: ['next', 'none'], description: 'Where the tasks not done go: "next" or "none"' }),
    },
  },
  {
    name: 'rename_sprint',
    description: 'Rename a sprint of a project. Its number stays: "Sprint 12 · Pricing push".',
    args: {
      sprintId: { type: 'string', description: 'The sprint, by its id (list_boards lists them)' },
      name: { type: 'string', nullable: true, maxLength: SPRINT_NAME_MAX_LENGTH, description: 'Its new name, or null for none' },
    },
  },
  {
    name: 'create_routine',
    description:
      'Set up a routine in a project: on a schedule, an agent runs the same instructions, each time as one run of its ' +
      'own. A routine owns no task; its run creates or changes tasks only if its instructions say to. It runs on ' +
      'behalf of the person you work for, with their access, until someone else changes it. It is on once made. A ' +
      'firing while its last run is still going is skipped. ' +
      `${ONLY_WHEN_ASKED}; also in a run of a routine, where the project does not let agents set schedules, and when ` +
      'the agent is not in the project, the schedule is more often than every 5 minutes, or the model cannot be used ' +
      'there. For one task at one time, use set_task_schedule instead.',
    args: {
      projectId: PROJECT,
      title: { type: 'string', maxLength: ROUTINE_TITLE_MAX_LENGTH, description: 'Its name' },
      agentId: { type: 'string', description: 'The agent that runs it, by its id (list_agents lists them). It must be in the project' },
      instructions: { type: 'string', maxLength: ROUTINE_INSTRUCTIONS_MAX_LENGTH, description: 'What the agent does each time, in Markdown: everything a run needs, since each run starts from these alone' },
      cron: CRON,
      timezone: opt(TIMEZONE),
      modelChoice: opt({ type: 'string', description: 'The model each run uses, as provider/model; omit it for the agent\'s own' }),
    },
  },
  {
    name: 'update_routine',
    description:
      'Change a routine, or switch it on or off. Pass only what changes. Any change, switching it on or off included, ' +
      'makes it run on behalf of the person you work for from then on, with their access: say so to them before you ' +
      'change a routine someone else set up. A new schedule, or switching it on, sets its next run from the schedule. ' +
      `${ONLY_WHEN_ASKED}; also in a run of a routine, where the project does not let agents set schedules, and for ` +
      'the same agent, schedule and model rules as create_routine.',
    args: {
      routineId: { type: 'string', description: 'The routine, by its id' },
      title: opt({ type: 'string', maxLength: ROUTINE_TITLE_MAX_LENGTH, description: 'Its new name' }),
      agentId: opt({ type: 'string', description: 'The agent that runs it, by its id. It must be in the project' }),
      instructions: opt({ type: 'string', maxLength: ROUTINE_INSTRUCTIONS_MAX_LENGTH, description: 'What the agent does each time, in Markdown, in full: it replaces the old instructions' }),
      cron: opt({ ...CRON, description: `${CRON.description}. Read in the timezone you name, else the person's you work for, else the routine's own` }),
      timezone: opt({ ...TIMEZONE, description: 'IANA timezone the cron rule is read in, such as Europe/London' }),
      modelChoice: clearable({ type: 'string', description: 'The model each run uses, as provider/model, or null for the agent\'s own' }),
      enabled: opt({ type: 'boolean', description: 'false switches it off (nothing more runs until it is on), true on' }),
    },
  },
]

/** The tools served: every one declared. */
export const SERVED_TASK_TOOL_DECLARATIONS: TaskToolDeclaration[] = TASK_TOOL_DECLARATIONS

/** open_board shows a board to the person in a conversation: a conversation's own tool, never a run's. */
export const CONVERSATION_ONLY_TASK_TOOLS: ReadonlySet<TaskToolName> = new Set(['open_board'])
