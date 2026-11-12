/**
 * A visitor's own tasks (usability finding 9, *Your tasks*): two tasks for them in their own space, made as they
 * enter, so Your tasks and Home show work for them from the first screen. They are in the visitor's space, which only
 * they see, so no other visitor's board fills with copies, and every sample task stays with the sample's people. No
 * agent is assigned: they are a person's to do, and nothing starts by itself.
 */
import { ensurePersonalProject } from '../../projects/personalProject'
import { createTask } from '../../projects/taskService'
import { originByPerson } from '../../projects/taskOnBehalfOf'
import { Logger } from '../../server/utils/logger'

const logger = new Logger('Demo')

export const VISITOR_TASKS: readonly { title: string; description: string; priority: 'HIGH' | 'MEDIUM' }[] = [
  {
    title: 'Review the launch-week checklist',
    description: 'Sam asked you to look over the checklist for launch week before Friday. It is in Website relaunch › '
      + 'Artefacts, as launch-week-checklist.md. Say there if anything is missing.',
    priority: 'HIGH',
  },
  {
    title: 'Read the case-study drafts',
    description: 'Writer is drafting the case-study page (WEB-4). The drafts are in the case-study-drafts workspace in '
      + 'Website relaunch: say on WEB-4 whether they read well.',
    priority: 'MEDIUM',
  },
]

/**
 * Makes the visitor's tasks in their space, after their account is made. A failure is logged and leaves the visitor
 * in, with no tasks of their own: these are a starting point, not what entry depends on.
 */
export async function giveVisitorTasks(userId: string): Promise<number> {
  try {
    const space = await ensurePersonalProject(userId)
    for (const t of VISITOR_TASKS) {
      await createTask({ ...t, projectId: space.id, state: 'TODO', origin: originByPerson(userId) })
    }
    return VISITOR_TASKS.length
  } catch (err) {
    logger.error(`could not make the visitor tasks of ${userId}:`, err)
    return 0
  }
}
