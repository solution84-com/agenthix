import type { LocationRef } from '@agenthix/core'
import type { OpenTaskFile } from '../../../projects/pages/useTasksToolUrl'

/** A task's file a chip opens in the file viewer. */
export interface OpenedTaskFile {
  taskId: string
  taskKey: string
  /** The task's own folder; null where it has none (a task of Your space). */
  loc: LocationRef | null
  file: OpenTaskFile
}
