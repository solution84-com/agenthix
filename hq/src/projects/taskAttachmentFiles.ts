import fs from 'node:fs/promises'
import { getTaskAttachmentsDir } from '../server/hqStoragePaths'
import { Logger } from '../server/utils/logger'

const logger = new Logger('TaskAttachments')

/**
 * A task's attachment rows go with it; the files are on hq's own disk, under one folder per task, and go here, once
 * the task's rows are gone. Never fails what called it: a folder left behind is logged by task and stays until
 * removed by hand (nothing can reach it, since the file route refuses a task that is gone).
 */
export async function removeTaskAttachmentFolders(taskIds: string[]): Promise<void> {
  for (const taskId of taskIds) {
    try {
      await fs.rm(getTaskAttachmentsDir(taskId), { recursive: true, force: true })
    } catch (err) {
      logger.warn(`the attachments of the deleted task ${taskId} could not be removed and stay until removed by hand:`, err)
    }
  }
}
