import { useEffect } from 'react'
import { useSearchParams } from 'react-router'
import type { LocationRef } from '@agenthix/core'
import { useFileViewer } from '../../storage/pages/viewer/useFileViewer'
import { projectPathOfTask } from '../../storage/pages/viewer/viewerFileParts'
import { taskLocation } from '../hooks/useTaskFiles'
import { taskEmbedOpeners } from './taskEmbedOpen'
import { taskFileOf } from '../pages/useTasksToolUrl'
import type { TaskFilesFacts } from './TaskFactsPanel'

/**
 * A task's files and the files its text names, each opening in the file viewer over the task with "‹ <task key>"
 * back (the file viewer's rule 1): the openers its Markdown takes, its attachments and its working files, each with
 * the one open in the viewer marked.
 */
export function useTaskFileViewer(taskId: string, taskKey: string, project: { id: string; personalSpace?: boolean | null } | null | undefined) {
  const viewer = useFileViewer()
  const loc: LocationRef | null = taskLocation(project, taskId || undefined)
  const from = { kind: 'task', taskKey } as const
  const shown = viewer.target
  const working: TaskFilesFacts = {
    loc,
    selected: shown?.kind === 'file' && shown.ref.space === 'place' && shown.ref.loc.taskId === taskId ? shown.ref.path : undefined,
    onOpen: path => {
      if (loc) viewer.open({ kind: 'file', ref: { space: 'place', loc, path }, placePath: projectPathOfTask(taskKey), taskKey, from })
    },
  }
  const attachments = {
    selected: shown?.kind === 'attachment' && shown.taskId === taskId ? shown.id : undefined,
    onOpen: (id: string) => viewer.open({ kind: 'attachment', taskId, taskKey, id, from }),
  }
  // A task's stable link names its file (`?task=QR-1&file=notes.md`, `&attachment=<id>`): it opens in the viewer.
  const [params] = useSearchParams()
  const named = new URLSearchParams(params)
  named.set('task', taskKey)
  const linked = taskFileOf(named)
  const linkedKey = linked ? JSON.stringify(linked) : null
  const { open } = viewer
  useEffect(() => {
    if (!linked || !taskId) return
    const drop = ['file', 'attachment']
    if (linked.kind === 'attachment') open({ kind: 'attachment', taskId, taskKey, id: linked.id, from }, { drop })
    else if (loc) open({ kind: 'file', ref: { space: 'place', loc, path: linked.path }, placePath: projectPathOfTask(taskKey), taskKey, from }, { drop })
    // The link is named by `linkedKey`; the task's place by its id.
  }, [linkedKey, taskId, !!loc]) // eslint-disable-line react-hooks/exhaustive-deps

  return { openers: taskEmbedOpeners({ taskId, taskKey, open: viewer.open }), working, attachments }
}
