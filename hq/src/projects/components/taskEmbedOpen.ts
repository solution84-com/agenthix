import type { SiteFileRef } from '@agenthix/core'
import type { OpenedTaskFile } from '../../shared/components/markdownEmbed/taskChipTypes'
import type { ViewerTarget } from '../../storage/pages/viewer/viewerAddress'
import { projectPathOfTask } from '../../storage/pages/viewer/viewerFileParts'

/** The place a file of an owner's storage is in, as an address: a person's own files are their space's. */
const placePathOf = (ref: SiteFileRef, taskKey: string) => {
  const owner = ref.space === 'place' ? ref.loc.ownerType : ref.owner.ownerType
  return owner === 'user' ? '/chat' : projectPathOfTask(taskKey)
}

/**
 * What a click on a file named in a task's text does (the file viewer's rule 1): every one — the task's own working
 * file or attachment, a file of the place's `files/`, a workspace's file, an artefact, another task's file — opens in
 * the file viewer over the task, with "‹ <task key>" back to it. Nothing leaves the task (S17, S23).
 */
export function taskEmbedOpeners(opts: {
  taskId: string
  taskKey: string
  open: (target: ViewerTarget) => void
}): { onOpen: (ref: SiteFileRef) => void; onOpenTaskFile: (file: OpenedTaskFile) => void } {
  const { taskId, taskKey, open } = opts
  const from = { kind: 'task', taskKey } as const
  return {
    onOpen: ref => {
      if (ref.space === 'knowledge') return
      const own = ref.space === 'place' && ref.loc.taskId === taskId
      open({ kind: 'file', ref, placePath: placePathOf(ref, taskKey), ...(own ? { taskKey } : {}), from })
    },
    onOpenTaskFile: file => {
      if (file.file.kind === 'attachment') {
        open({ kind: 'attachment', taskId: file.taskId, taskKey: file.taskKey, id: file.file.id, from })
        return
      }
      if (!file.loc) return
      const ref: SiteFileRef = { space: 'place', loc: file.loc, path: file.file.path }
      open({ kind: 'file', ref, placePath: projectPathOfTask(file.taskKey), taskKey: file.taskKey, from })
    },
  }
}
