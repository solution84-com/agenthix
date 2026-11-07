import { useCallback } from 'react'
import { useSearchParams } from 'react-router'

export type TasksScreen =
  | { kind: 'list' }
  | { kind: 'backlog' }
  | { kind: 'done' }
  | { kind: 'task'; taskKey: string; atWaiting: boolean }
  | { kind: 'session'; taskKey: string }

/** Where the Tasks tool is, read from the address: `?tool=tasks&task=WEB-27&view=session` (every screen reviewed spec §3). */
export function screenOf(params: URLSearchParams): TasksScreen {
  const view = params.get('view')
  const taskKey = params.get('task')
  if (taskKey) {
    return view === 'session' ? { kind: 'session', taskKey } : { kind: 'task', taskKey, atWaiting: params.get('at') === 'waiting' }
  }
  return view === 'backlog' ? { kind: 'backlog' } : view === 'done' ? { kind: 'done' } : { kind: 'list' }
}

/** A file of the open task, open beside it: one of its working files, or an attachment. */
export type OpenTaskFile = { kind: 'working'; path: string } | { kind: 'attachment'; id: string }

/**
 * The task's file in the address: `?task=WEB-42&file=notes.md` for a working file (spec part 3, *Stable links*), the
 * path inside the task's folder; `&attachment=<id>` for an attachment.
 */
export function taskFileOf(params: URLSearchParams): OpenTaskFile | null {
  if (!params.get('task')) return null
  const path = params.get('file')
  if (path) return { kind: 'working', path }
  const id = params.get('attachment')
  return id ? { kind: 'attachment', id } : null
}

/** The address's parameters naming a task's file, null where they go. */
export function taskFileParams(file: OpenTaskFile | null): { file: string | null; attachment: string | null } {
  return { file: file?.kind === 'working' ? file.path : null, attachment: file?.kind === 'attachment' ? file.id : null }
}

/**
 * A task's link names no tool (`/projects/WEB?task=WEB-42&file=notes.md`, spec part 3, *Stable links*): the address
 * that opens it in the Tasks tool, or null when the address already names a tool or no task.
 */
export function taskLinkInTool(search: string): string | null {
  const params = new URLSearchParams(search)
  if (!params.get('task') || params.get('tool')) return null
  params.set('tool', 'tasks')
  return `?${params.toString()}`
}

/** The tool's own place in the address; moving within it replaces the entry, as opening a tool does. */
export function useTasksToolUrl() {
  const [params, setParams] = useSearchParams()
  const screen = screenOf(params)

  const go = useCallback((view: string | null, task: string | null, at: string | null = null, file: OpenTaskFile | null = null) => {
    setParams(prev => {
      const next = new URLSearchParams(prev)
      const { file: path, attachment } = taskFileParams(file)
      for (const [name, value] of [['view', view], ['task', task], ['at', at], ['file', path], ['attachment', attachment]] as const) {
        if (value) next.set(name, value)
        else next.delete(name)
      }
      return next
    }, { replace: true })
  }, [setParams])

  return {
    screen,
    file: taskFileOf(params),
    toList: useCallback(() => go(null, null), [go]),
    toTask: useCallback((taskKey: string, atWaiting = false) => go(null, taskKey, atWaiting ? 'waiting' : null), [go]),
    toSession: useCallback((taskKey: string) => go('session', taskKey), [go]),
    toTaskFile: useCallback((taskKey: string, file: OpenTaskFile | null) => go(null, taskKey, null, file), [go]),
  }
}
