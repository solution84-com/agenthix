/**
 * A run started by a message into a task's session runs as a chat turn in that
 * session, so its tool request never reaches the task machine
 * (`taskStatusListener.ts`, which only sees runs that carry the task). It still
 * waits for a person: the one who sent the message, whom it is on behalf of
 * (every-screen-reviewed spec §9). This tells them, as a task run's request
 * tells its person. The approval card itself is the session's.
 *
 * The frame must come from the site that holds the session, and the person read
 * off that site's run must still be on the task's project; otherwise the task's
 * own person is told, so a site cannot point a notification at anyone it likes.
 */
import { prisma } from 'wasp/server'
import { runOnBehalfOf } from '@agenthix/core'
import { Logger } from '../server/utils/logger'
import { onRunStatus } from '../sites/channel/siteEventHandler'
import * as siteRuntimeStore from '../sessions/siteRuntimeStore'
import { resolveSiteIdForSession } from './dispatchSiteResolution'
import { personMayWorkInProject } from '../projects/taskOnBehalfOf'
import { notifyApprovalWaiting } from './approvalNotification'

const logger = new Logger('TaskSessionApproval')

export function registerTaskSessionApprovalListener(): void {
  onRunStatus('task-session-approval', async (e, siteId) => {
    if (!e.manifestPending || e.taskId) return
    try {
      const session = await prisma.agentSession.findUnique({ where: { id: e.sessionId } })
      if (!session?.taskId) return
      if ((await resolveSiteIdForSession(session)) !== siteId) {
        logger.warn(`a tool request for session ${session.id} came from site ${siteId}, which does not hold it — ignored`)
        return
      }
      const task = await prisma.task.findUnique({ where: { id: session.taskId }, select: { projectId: true, onBehalfOfUserId: true } })
      if (!task) return
      const run = await siteRuntimeStore.getRun(siteId, e.runId)
      const sender = runOnBehalfOf(run?.metadata)
      const personId = sender && (await personMayWorkInProject(task.projectId, sender)) ? sender : task.onBehalfOfUserId
      await notifyApprovalWaiting(session.taskId, e.agentId, e.manifestPending.summary, personId)
    } catch (err) {
      logger.error(`could not tell anyone of the tool request in session ${e.sessionId}`, err)
    }
  })
}
