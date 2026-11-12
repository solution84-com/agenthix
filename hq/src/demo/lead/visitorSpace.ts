/**
 * A visitor's space made ready for an agent's work there, as the visitor could make it themselves, being its only
 * admin: the space made if it is not there yet, the agent put on its roster (a space starts with Kernel alone), and an
 * *In review* column on its Task type, where a scripted run that finishes hands its task over (site's
 * `demo/runtime/handOver.ts`). Each step is skipped when it is already done.
 */
import { prisma } from 'wasp/server'
import { ensurePersonalProject } from '../../projects/personalProject'
import { addAgentToProject } from '../../projects/agentAssignment'
import { addTypeColumn } from '../../projects/typeColumnService'
import { DEMO_REVIEW_COLUMN, DEMO_REVIEW_COLUMN_NAME } from '@agenthix/core'

export async function visitorSpaceFor(personId: string, agentId: string): Promise<string> {
  const space = await ensurePersonalProject(personId)
  const onIt = await prisma.projectAgent.findUnique({ where: { projectId_agentId: { projectId: space.id, agentId } }, select: { agentId: true } })
  if (!onIt) await addAgentToProject({ projectId: space.id, agentId })
  const type = await prisma.taskType.findFirst({
    where: { projectId: space.id, kind: 'TASK' },
    select: { id: true, columns: { select: { name: true } } },
  })
  if (type && !type.columns.some(c => DEMO_REVIEW_COLUMN_NAME.test(c.name))) {
    await addTypeColumn({ typeId: type.id, name: DEMO_REVIEW_COLUMN, state: 'IN_PROGRESS' })
  }
  return space.id
}
