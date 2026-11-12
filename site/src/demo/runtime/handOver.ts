import { DEMO_REVIEW_COLUMN_NAME } from '@agenthix/core'
import { SYSTEM_MCP_TOOLS } from '../../shared/mcpTools'
import { callHqData } from '../../server/hq/dataClient'
import { Logger } from '../../server/utils/logger'
import type { RunContext } from '../../agents/runtime/types'

const logger = new Logger('DemoRunHandOver')

type TaskPlace = { columnId?: string | null; typeColumns?: { columnId: string; name: string }[] }

/** The column a finished task goes to for a person to check: its type's first with "review" in its name; null for none. */
export function reviewColumnOf(task: TaskPlace): string | null {
  const column = (task.typeColumns ?? []).find(c => DEMO_REVIEW_COLUMN_NAME.test(c.name))
  return column && column.columnId !== task.columnId ? column.columnId : null
}

/**
 * A completed scripted task run hands its task over for review, as an agent does at the end of its work: it reads
 * its task and moves it with update_task, through the run's own capability, so hq checks the move as any agent's.
 * A task whose type has no review column, or one already there, stays where it is. A move that fails leaves the
 * task as it was; the run has ended all the same.
 */
export async function handOverToReview(context: RunContext): Promise<void> {
  const jwt = context.capability?.jwt
  const taskId = context.taskId
  if (!jwt || !taskId) return
  try {
    const task = await callHqData(SYSTEM_MCP_TOOLS.TASK.GET_TASK_DETAILS, { taskId }, jwt) as TaskPlace
    const columnId = reviewColumnOf(task)
    if (columnId) await callHqData(SYSTEM_MCP_TOOLS.TASK.UPDATE_TASK, { taskId, columnId }, jwt)
  } catch (err) {
    logger.warn(`could not hand task ${taskId} over for review after run ${context.runId}: ${err instanceof Error ? err.message : String(err)}`)
  }
}
