import type { SiteFileRef } from '@agenthix/core'
import type { OpenedTaskFile } from '../../shared/components/markdownEmbed/taskChipTypes'
import { taskFileParams, type OpenTaskFile } from '../pages/useTasksToolUrl'
import { workspaceAddress } from '../placeAddresses'

/** The address of a task with one of its files open: the task's own page, which keeps the file in `?file=` or `?attachment=`. */
export function taskFileAddress(taskKey: string, file: OpenTaskFile): string {
  const params = new URLSearchParams()
  for (const [name, value] of Object.entries(taskFileParams(file))) if (value) params.set(name, value)
  return `/tasks/${encodeURIComponent(taskKey)}?${params.toString()}`
}

/**
 * What a click on an embedded file in a task's text does (spec part 2, *Embedded files*). One of the task's own files
 * (a working file, an attachment) opens beside the task through `openBeside`; a file of the place's `files/` opens in
 * the Files tool of the place it is in (the beside view takes only the task's own files); a workspace's file opens in
 * that workspace; an artefact in the place's Artefacts; another task's file opens on that task's page.
 */
export function taskEmbedOpeners(opts: {
  taskId: string
  taskKey: string
  openBeside: (file: OpenTaskFile) => void
  go: (address: string) => void
}): { onOpen: (ref: SiteFileRef) => void; onOpenTaskFile: (file: OpenedTaskFile) => void } {
  const { taskId, taskKey, openBeside, go } = opts
  const projectKey = taskKey.replace(/-\d+$/, '')
  return {
    onOpen: ref => {
      if (ref.space === 'artefact') {
        const place = ref.owner.ownerType === 'user' ? '/chat' : `/projects/${projectKey}`
        return go(`${place}?tool=artefacts&artefact=${encodeURIComponent(ref.name)}`)
      }
      if (ref.space !== 'place') return
      const { loc, path } = ref
      if (loc.taskId === taskId) return openBeside({ kind: 'working', path })
      const place = loc.ownerType === 'user' ? '/chat' : `/projects/${projectKey}`
      if (loc.workspaceId) return go(workspaceAddress({ key: loc.ownerType === 'user' ? null : projectKey }, loc.workspaceId))
      go(`${place}?tool=files&file=${encodeURIComponent(path)}`)
    },
    onOpenTaskFile: file => {
      if (file.taskId === taskId) openBeside(file.file)
      else go(taskFileAddress(file.taskKey, file.file))
    },
  }
}
