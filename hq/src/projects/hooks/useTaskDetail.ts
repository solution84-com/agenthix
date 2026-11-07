import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router'
import {
  useQuery, useAction,
  updateTask, deleteTask, archiveTask, getTask, getTaskSession, getTaskComments, addTaskComment,
  runTask, stopTask, dismissTaskRun, getBoards, moveTaskToColumn, moveTaskToBoard, getTaskRuns,
} from 'wasp/client/operations'
import { useSocket, useSocketListener } from 'wasp/client/webSocket'
import { useProjectAgents } from './useProjectAgents'
import { stopTaskWithNotice, type StopNotice } from '../pages/taskStopNotice'

// ── Types ──────────────────────────────────────────────────────────────────

type Priority = 'LOW' | 'MEDIUM' | 'HIGH'

/** A board column; @agenthix/ui's task view still calls it a stage. */
export interface BoardStage {
  name: string
  label: string
  status: 'TODO' | 'IN_PROGRESS' | 'DONE'
  color: string
  order: number
}

export type TaskComment = {
  id: string
  taskId: string
  authorType: string
  agentId: string | null
  agentName: string | null
  agentHandle: string | null
  userId: string | null
  runId: string | null
  content: string
  createdAt: string | Date
}

// ── Hook ───────────────────────────────────────────────────────────────────

export function useTaskDetail(taskId: string | undefined) {
  const navigate = useNavigate()

  const { data: task, isLoading: taskLoading, refetch: refetchTask } =
    useQuery(getTask, taskId ? { taskId } : undefined, { enabled: !!taskId })
  const agents = useProjectAgents(task?.projectId, task?.assignedAgentId)
  const { data: boards } = useQuery(getBoards, task?.projectId ? { projectId: task.projectId } : undefined, { enabled: !!task?.projectId })
  const { data: taskSession, isLoading: sessionLoading, refetch: refetchSession } =
    useQuery(getTaskSession, task ? { taskId: task.id } : undefined, { enabled: !!task })
  const { data: taskComments, refetch: refetchComments } =
    useQuery(getTaskComments, task ? { taskId: task.id } : undefined, { enabled: !!task })
  // An epic is never run, so it has no runs to read from its site.
  const { data: taskRuns, refetch: refetchRuns } =
    useQuery(getTaskRuns, task && !task.isEpic ? { taskId: task.id } : undefined, { enabled: !!task && !task.isEpic })

  const updateTaskFn = useAction(updateTask)
  const deleteTaskFn = useAction(deleteTask)
  const archiveTaskFn = useAction(archiveTask)
  const addTaskCommentFn = useAction(addTaskComment)
  const runTaskFn = useAction(runTask)
  const stopTaskFn = useAction(stopTask)
  const dismissTaskRunFn = useAction(dismissTaskRun)
  const moveTaskToColumnFn = useAction(moveTaskToColumn)
  const moveTaskToBoardFn = useAction(moveTaskToBoard)

  const [confirmDelete, setConfirmDelete] = useState(false)
  const [confirmArchive, setConfirmArchive] = useState(false)
  const [actionBusy, setActionBusy] = useState(false)
  const [stopNotice, setStopNotice] = useState<StopNotice | null>(null)
  const [commentDraft, setCommentDraft] = useState('')
  const [commentBusy, setCommentBusy] = useState(false)
  const [liveComments, setLiveComments] = useState<TaskComment[]>([])
  const [sessionId, setSessionId] = useState<string | undefined>()
  const commentTextareaRef = useRef<HTMLTextAreaElement>(null)

  const { socket, isConnected } = useSocket()

  // Reset per-task UI state when task changes
  useEffect(() => { setConfirmDelete(false); setConfirmArchive(false); setLiveComments([]); setStopNotice(null) }, [task?.id])

  // Track session ID when session data loads
  useEffect(() => {
    const id = taskSession?.id
    if (id) setSessionId(id)
  }, [taskSession])

  // Discover session via socket event when task starts (no polling needed)
  useSocketListener('taskSessionStarted', useCallback((data: { sessionId: string }) => {
    setSessionId(data.sessionId)
  }, []))

  // Subscribe to session's socket room
  useEffect(() => {
    if (isConnected && socket && sessionId) {
      socket.emit('subscribeToSession', sessionId as any)
    }
  }, [isConnected, socket, sessionId])

  // Subscribe to task's socket room for live comments
  useEffect(() => {
    if (isConnected && socket && task?.id) {
      socket.emit('subscribeToTask', task.id as any)
    }
  }, [isConnected, socket, task?.id])

  const handleTaskCommentAdded = useCallback((data: TaskComment) => {
    setLiveComments(prev => [...prev, data])
  }, [])

  useSocketListener('taskCommentAdded', handleTaskCommentAdded)

  // Refetch task + session when a run completes (state may have changed: RUNNING → DONE, etc.)
  useSocketListener('agentRunStatus', useCallback((data: { status: string }) => {
    if (['RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED'].includes(data.status)) {
      void refetchTask()
      void refetchSession()
      if (task && !task.isEpic) void refetchRuns()
    }
  }, [refetchTask, refetchSession, refetchRuns, task]))

  // ── Derived ─────────────────────────────────────────────────────────────

  // A column's state is stored as text; the board's create and edit allow only the three states.
  const boardStages = (task ? [...task.board.columns].sort((a, b) => a.order - b.order) : []) as BoardStage[]

  // ── Handlers ────────────────────────────────────────────────────────────

  const patch = useCallback(async (data: Record<string, unknown>) => {
    if (!task) return
    await updateTaskFn({ taskId: task.id, ...data })
  }, [task, updateTaskFn])

  const handleStageChange = (newStageName: string) => {
    if (!task) return
    if (!boardStages.some(s => s.name === newStageName)) return
    void moveTaskToColumnFn({ taskId: task.id, column: newStageName, boardId: task.boardId ?? undefined })
  }

  const handleStatusChange = (newStatus: string) => void patch({ status: newStatus })

  const handlePriorityChange = (p: string) => void patch({ priority: p })

  const handleWorkspaceChange = (workspaceId: string | null) => void patch({ workspaceId })

  const handleAgentChange = (agentId: string | null) =>
    void patch({ assignedAgentId: agentId || null })

  // Into the other board's Backlog (adr-0097); a task is always on a board, so "none" is not a choice.
  const handleBoardChange = (boardId: string | null) => {
    if (task && boardId && boardId !== task.boardId) void moveTaskToBoardFn({ taskId: task.id, boardId })
  }

  // The page's own moves: each answers whether it worked, so a failure can open the centred dialog.
  const moveToColumn = async (column: string | null) => {
    if (!task || (task.column ?? null) === column) return
    await moveTaskToColumnFn({ taskId: task.id, column, boardId: task.boardId ?? undefined })
  }

  const moveToBoard = async (boardId: string) => {
    if (task && boardId && boardId !== task.boardId) await moveTaskToBoardFn({ taskId: task.id, boardId })
  }

  const handleSaveTitle = async (v: string) => patch({ title: v })

  const handleSaveDescription = async (v: string) => patch({ description: v })

  const handleStartTask = async () => {
    if (!task) return
    setActionBusy(true)
    setStopNotice(null)
    try { await runTaskFn({ taskId: task.id }) }
    finally { setActionBusy(false) }
  }

  const handleStopTask = async () => {
    if (!task) return
    setActionBusy(true)
    try { setStopNotice(await stopTaskWithNotice(stopTaskFn, task.id)) }
    finally {
      setActionBusy(false)
      void refetchTask()
      void refetchSession()
    }
  }

  const handleDismissRun = async () => {
    if (!task) return
    setActionBusy(true)
    try { await dismissTaskRunFn({ taskId: task.id }) }
    finally {
      setActionBusy(false)
      void refetchTask()
    }
  }

  const handleAddComment = async () => {
    if (!commentDraft.trim()) return
    setCommentBusy(true)
    try {
      await addTaskCommentFn({ taskId: task!.id, content: commentDraft.trim() })
      setCommentDraft('')
      if (commentTextareaRef.current) commentTextareaRef.current.style.height = 'auto'
      await refetchComments()
    } finally {
      setCommentBusy(false)
    }
  }

  const handleDelete = async (onSuccess?: () => void) => {
    if (!confirmDelete) { setConfirmDelete(true); return }
    try {
      await deleteTaskFn({ taskId: task!.id })
      if (onSuccess) onSuccess()
      else navigate(-1)
    } catch {
      setConfirmDelete(false)
    }
  }

  const handleArchive = async (onSuccess?: () => void) => {
    if (!confirmArchive) { setConfirmArchive(true); return }
    try {
      await archiveTaskFn({ taskId: task!.id })
      if (onSuccess) onSuccess()
      else navigate(-1)
    } catch {
      setConfirmArchive(false)
    }
  }

  // ── Return ───────────────────────────────────────────────────────────────

  return {
    // Data — `stage` is @agenthix/ui's name for the task's column.
    task: task ? { ...task, stage: task.column, board: { ...task.board, stages: boardStages } } : task,
    taskLoading,
    agents: agents as any[],
    boards: ((boards as any[]) ?? []).map(b => ({ ...b, stages: b.columns })),
    taskSession,
    sessionLoading,
    taskComments: taskComments ?? [],
    taskRuns: taskRuns as unknown[] | undefined,
    liveComments,
    sessionId,
    boardStages,
    // Refs
    commentTextareaRef,
    // Refetch
    refetchTask,
    refetchSession,
    refetchComments,
    refetchRuns,
    // UI state
    confirmDelete,
    confirmArchive,
    actionBusy,
    stopNotice,
    commentDraft,
    setCommentDraft,
    commentBusy,
    // Handlers
    patch,
    handleStageChange,
    handleStatusChange,
    handlePriorityChange,
    handleWorkspaceChange,
    handleAgentChange,
    handleBoardChange,
    moveToColumn,
    moveToBoard,
    handleSaveTitle,
    handleSaveDescription,
    handleStartTask,
    handleStopTask,
    handleDismissRun,
    handleAddComment,
    handleDelete,
    handleArchive,
    // Imperative utilities for TaskPage streaming cleanup
    clearLiveComments: () => setLiveComments([]),
    resetSession: () => setSessionId(undefined),
  }
}
