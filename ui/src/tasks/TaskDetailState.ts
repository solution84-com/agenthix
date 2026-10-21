import type { RefObject } from 'react'
import type { BoardOption, BoardStage } from './TaskMetaSidebar'
import type { AgentPickerOption } from './AgentPicker'
import type { CommentLike } from './CommentsSection'

// Shape consumed by the lifted TaskPanel. Site's useTaskDetail and HQ's
// useHqTaskDetail both conform to this so the panel renders identically
// without knowing which data layer fed it.

export interface TaskDetailTask {
  id: string
  title: string
  description?: string | null
  status: string
  stage?: string | null
  priority: string
  boardId?: string | null
  assignedAgentId?: string | null
  number?: number
  taskKey?: string
  projectId?: string
  project?: { id: string; name: string; key: string }
  board?: { id: string; name: string; stages: BoardStage[] | string } | null
  // Loose passthrough for any extra fields TaskPanel renderers need.
  [k: string]: unknown
}

export interface TaskDetailComment extends CommentLike {
  content: string
}

export interface TaskDetailSession {
  id?: string
  status?: string
  [k: string]: unknown
}

export interface TaskDetailState {
  task: TaskDetailTask | null | undefined
  taskLoading: boolean
  agents: AgentPickerOption[]
  boards: BoardOption[]
  taskSession: TaskDetailSession | null | undefined
  taskComments: TaskDetailComment[]
  liveComments: TaskDetailComment[]
  boardStages: BoardStage[]

  commentTextareaRef: RefObject<HTMLTextAreaElement | null>

  confirmDelete: boolean
  confirmArchive: boolean
  actionBusy: boolean
  commentDraft: string
  setCommentDraft: (v: string) => void
  commentBusy: boolean

  handleSaveTitle:       (v: string) => Promise<void>
  handleSaveDescription: (v: string) => Promise<void>
  handleStartTask:       () => Promise<void>
  handleStopTask:        () => Promise<void>
  handleAddComment:      () => Promise<void>
  handleClearSession:    () => Promise<void> | void
  handleBoardChange:     (boardId: string | null) => void
  handleStageChange:     (stage: string) => void
  handleStatusChange:    (status: string) => void
  handlePriorityChange:  (priority: string) => void
  handleAgentChange:     (agentId: string | null) => void
  handleArchive:         (onSuccess?: () => void) => Promise<void>
  handleDelete:          (onSuccess?: () => void) => Promise<void>
}
