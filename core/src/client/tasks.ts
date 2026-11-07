/**
 * A task as a client reads it from hq: its own fields, the lists and the one task the Tasks tool, Your tasks and
 * the task page read, its comments, and the arguments and answers of the task operations (Wasp queries and
 * actions, sent with superjson). Dates are `Date`: superjson carries them as dates, and the client receives a
 * `Date`. A board's view of a task is ./boards.ts; a task's session ./taskSession.ts.
 */
import type { TaskRunState } from '../models/task.js'
import type { BoardKind } from '../models/board.js'
import type { BoardColumn } from './boards.js'
import type { ProjectFields } from './projects.js'
import type { RunWaitNote } from './runs.js'

export type { TaskRunState } from '../models/task.js'

/** A task's own state, which follows the column it is in: To do in the Backlog. */
export type TaskState = 'TODO' | 'IN_PROGRESS' | 'DONE'
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
  boardId: string
  /** The board column it is in; null: the board's Backlog. */
  column: string | null
  sprintId: string | null
  /** The model its runs use, when one was picked for the task (since 1.15); null or absent: the agent's own. */
  modelChoice?: string | null
  status: TaskState
  assignedAgentId: string | null
  priority: TaskPriorityLevel
  labels: string[]
  archived: boolean
  doneAt: Date | null
  runState: TaskRunState
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
  routineId: string | null
  roundAt: Date | null
  planStart: Date | null
  planFinish: Date | null
  isEpic: boolean
  epicId: string | null
  milestoneId: string | null
  createdAt: Date
  updatedAt: Date
}

/** The board a listed task is on, with its columns. */
export type TaskBoardRef = { id: string; name: string; kind: BoardKind; columns: BoardColumn[] }
export type TaskProjectRef = { id: string; name: string; key: string }

/** A task in a project's list (`getTasks`): its agent, its board and why its run waits. */
export type ProjectTaskListItem = TaskFields & {
  assignedAgent: AgentRef | null
  board: TaskBoardRef
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

export type GetTasksArgs = { projectId: string; boardId?: string; status?: TaskState; includeArchived?: boolean }
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
  /** Omitted: Project Tasks. */
  boardId?: string | null
  /** A column of the board, by name or state; omitted: its Backlog. */
  column?: string | null
  assignedAgentId?: string | null
  /** Any case: "high" and "HIGH" are one. */
  priority?: string
  labels?: string[]
}

/** `column` null: the board's Backlog. `boardId` names another board to move it onto. */
export type MoveTaskToColumnArgs = { taskId: string; column: string | null; boardId?: string }
/** Into the other board's Backlog. */
export type MoveTaskToBoardArgs = { taskId: string; boardId: string }

/** How many runs a Stop cancelled on the task's site. */
export type StopResult = { cancelled: number }
export type StopTaskSessionArgs = { sessionId: string }
