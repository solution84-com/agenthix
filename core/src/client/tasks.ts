/**
 * A task as a client reads it from hq: its own fields, the lists and the one task the Tasks tool, Your tasks and
 * the task page read, its comments, and the arguments and answers of the task operations (Wasp queries and
 * actions, sent with superjson). Dates are `Date`: superjson carries them as dates, and the client receives a
 * `Date`. A board's view of a task is ./boards.ts; a task's session ./taskSession.ts.
 */
import type { TaskRunState } from '../models/task.js'
import type { TaskState, TaskTypeRef, TypeColumnRef } from '../tasks/taskModel.js'
import type { ExecutionState } from '../tasks/executionState.js'
import type { BoardWorkflowKind } from '../models/board.js'
import type { BoardColumn } from './boards.js'
import type { ProjectFields } from './projects.js'
import type { RunWaitNote } from './runs.js'

export type { TaskRunState } from '../models/task.js'

/**
 * A task's state on the board it was on: To do in the Backlog.
 * @deprecated since 1.16; stops working in 3.0. Use `TaskState` instead.
 */
export type BoardTaskStatus = 'TODO' | 'IN_PROGRESS' | 'DONE'
export type TaskPriorityLevel = 'LOW' | 'MEDIUM' | 'HIGH'
export type CommentAuthorType = 'AGENT' | 'USER'

/** An agent where a task names it. */
export type AgentRef = { id: string; name: string; handle: string }

/**
 * A task's own fields, as hq stores them. `runStateReason` is the one a person should read (hq swaps a held
 * task's stored reason for it). `labels` is a list of words; `planStart` and `planFinish` are calendar dates.
 */
export type TaskFields = {
  id: string
  title: string
  description: string | null
  projectId: string
  number: number
  /**
   * A task is on no board (adr-0176).
   * @deprecated since 1.16; stops working in 3.0. Nothing replaces it.
   */
  boardId: string
  /**
   * The board column it is in; null: the board's Backlog.
   * @deprecated since 1.16; stops working in 3.0. Use `columnId` instead.
   */
  column: string | null
  /** Its type (since 1.16); absent from an hq before it. */
  typeId?: string
  /** One of its type's columns (since 1.16). */
  columnId?: string
  /** Its task state, the state of its column, Backlog first (since 1.16). */
  state?: TaskState
  /** Its place in the project's one order (since 1.16): compared as text, never shown. */
  rank?: string
  sprintId: string | null
  /** The model its runs use, when one was picked for the task (since 1.15); null or absent: the agent's own. */
  modelChoice?: string | null
  /** @deprecated since 1.16; stops working in 3.0. Use `state` instead. */
  status: BoardTaskStatus
  assignedAgentId: string | null
  priority: TaskPriorityLevel
  labels: string[]
  archived: boolean
  doneAt: Date | null
  /** @deprecated since 1.16; stops working in 3.0. Use `executionState` instead. */
  runState: TaskRunState
  /** What an agent is doing with it now, set by the system from its latest run (since 1.16). */
  executionState?: ExecutionState
  runStateReason: string | null
  runId: string | null
  /** Its latest run's result, as that run stated it: null when that run stated none, or it has had no run. */
  result: string | null
  deferCount: number
  lastWorkedAt: Date | null
  runStartedBy: string | null
  runOnBehalfOfUserId: string | null
  queueDepth: number
  onBehalfOfUserId: string
  queuedByUserId: string | null
  queuedByAgentId: string | null
  queuedBySessionId: string | null
  queuedByConnectionId: string | null
  createdByConnectionId: string | null
  scheduleAt: Date | null
  scheduleNextDueAt: Date | null
  scheduleSetByUserId: string | null
  scheduleSetByAgentId: string | null
  scheduleSetBySessionId: string | null
  scheduleSetByConnectionId: string | null
  /**
   * A routine makes no task (adr-0177).
   * @deprecated since 1.16; stops working in 3.0. Nothing replaces it.
   */
  routineId: string | null
  /**
   * A routine makes no task (adr-0177).
   * @deprecated since 1.16; stops working in 3.0. Nothing replaces it.
   */
  roundAt: Date | null
  planStart: Date | null
  planFinish: Date | null
  /**
   * An epic is a task of type Epic.
   * @deprecated since 1.16; stops working in 3.0. Use `typeId` instead.
   */
  isEpic: boolean
  epicId: string | null
  milestoneId: string | null
  createdAt: Date
  updatedAt: Date
}

/**
 * The board a listed task is on, with its columns.
 * @deprecated since 1.16; stops working in 3.0. Use `TaskTypeRef` instead.
 */
export type TaskBoardRef = { id: string; name: string; kind: BoardWorkflowKind; columns: BoardColumn[] }
export type TaskProjectRef = { id: string; name: string; key: string }

/** A task in a project's list (`getTasks`): its agent, its board and why its run waits. */
export type ProjectTaskListItem = TaskFields & {
  assignedAgent: AgentRef | null
  /** @deprecated since 1.16; stops working in 3.0. Use `type` instead. */
  board: TaskBoardRef
  /** Its type (since 1.16). */
  type?: TaskTypeRef
  /** Its column, by name: a screen shows the column only, never the state beside it (since 1.16). */
  typeColumn?: TypeColumnRef
  runWait: RunWaitNote | null
}

/** A task in Your tasks (`getMyTasks`), and one task opened by id (`getTask`): with its project too. */
export type TaskListItem = ProjectTaskListItem & { project: TaskProjectRef }

/** One task opened by its key (`getTaskByKey`): its key, and its project's own fields. */
export type TaskByKey = ProjectTaskListItem & { taskKey: string; project: ProjectFields }

/** A comment on a task. */
export type TaskCommentFields = {
  id: string
  taskId: string
  authorType: CommentAuthorType
  agentId: string | null
  userId: string | null
  /** The person's connection a person's comment was written through, when one was. */
  connectionId: string | null
  runId: string | null
  content: string
  /** The top-level comment this one replies to (since 1.14); null or absent on a top-level comment. Replies go one level deep. */
  parentId?: string | null
  /** Whether it was saved from the task's conversation (since 1.15); absent or false: written in the comments. */
  savedFromConversation?: boolean
  createdAt: Date
}

/** A comment as `addTaskComment` answers it: with the agent that wrote it, when one did. */
export type TaskCommentView = TaskCommentFields & { agent: AgentRef | null }

/** A comment in a task's list: who wrote it by name — "You" for the reader, null for an agent's. */
export type TaskCommentListItem = TaskCommentView & { userName: string | null }

// ── Arguments and answers ──

export type GetTasksArgs = {
  projectId: string
  /**
   * A task is on no board.
   * @deprecated since 1.16; stops working in 3.0. Nothing replaces it.
   */
  boardId?: string
  /** @deprecated since 1.16; stops working in 3.0. Use `state` instead. */
  status?: BoardTaskStatus
  /** Only tasks in this task state (since 1.16). */
  state?: TaskState
  includeArchived?: boolean
}
export type TaskIdArgs = { taskId: string }
export type GetTaskByKeyArgs = { taskKey: string }
/** `parentId` makes it a reply to that top-level comment of the same task. */
/** `savedFromConversation` marks a comment saved from the task's conversation (since 1.15). */
export type AddTaskCommentArgs = { taskId: string; content: string; parentId?: string | null; savedFromConversation?: boolean }

/** An optional field sent as null is as one left out. */
export type CreateTaskArgs = {
  projectId: string
  title: string
  description?: string | null
  /**
   * Omitted: Project Tasks.
   * @deprecated since 1.16; stops working in 3.0. Use `typeId` instead.
   */
  boardId?: string | null
  /**
   * A column of the board, by name or state; omitted: its Backlog.
   * @deprecated since 1.16; stops working in 3.0. Use `columnId` instead.
   */
  column?: string | null
  /** One of the project's task types (since 1.16); omitted: Task. */
  typeId?: string | null
  /** One of the type's columns (since 1.16); omitted: the type's default Backlog column, unless `state` is given. */
  columnId?: string | null
  /** A task state, landing on the type's default column for it (since 1.16). */
  state?: TaskState | null
  assignedAgentId?: string | null
  /** Any case: "high" and "HIGH" are one. */
  priority?: string
  labels?: string[]
}

/** `column` null: the board's Backlog. `boardId` names another board to move it onto. */
export type MoveTaskToColumnArgs = {
  taskId: string
  /** @deprecated since 1.16; stops working in 3.0. Use `columnId` instead. */
  column: string | null
  /**
   * A task is on no board.
   * @deprecated since 1.16; stops working in 3.0. Nothing replaces it.
   */
  boardId?: string
  /** One of the task's type's columns (since 1.16); when given, `column` is not read. */
  columnId?: string
}
/**
 * Into the other board's Backlog.
 * @deprecated since 1.16; stops working in 3.0. Nothing replaces it.
 */
export type MoveTaskToBoardArgs = { taskId: string; boardId: string }

/** How many runs a Stop cancelled on the task's site. */
export type StopResult = { cancelled: number }
export type StopTaskSessionArgs = { sessionId: string }
