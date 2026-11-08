import type { GetWorkforceTemplates, GetWorkforceTemplate, GetExistingAgentHandles, GetWorkforceReviewTask, GetAgentTemplates } from 'wasp/server/operations'
import { HttpError } from 'wasp/server'
import { prisma } from 'wasp/server'
import type { Prisma } from '@prisma/client'
import type { WorkforceTemplateContent } from './workforceTemplateTypes'
import { listAgentTemplates, type AgentTemplateSummary } from './agentTemplateService'
import { MADE_FROM_WORKFORCE_ASSEMBLY } from './systemTemplates'
import { canSeeTask } from '../projects/resourceEntitlement'
import { isOrgAdmin } from '../projects/membership'

// ── Workforce template queries ────────────────────────────────────────────────

type GetWorkforceTemplatesResult = Array<{ id: string; name: string; description: string; tags: string[] }>

export const getWorkforceTemplates: GetWorkforceTemplates<void, GetWorkforceTemplatesResult> = async (_args, context) => {
  if (!context.user) throw new HttpError(401, 'Not authenticated')
  const { listTeamTemplates } = await import('./workforceTemplateService')
  return (await listTeamTemplates()).map(({ id, name, description, tags }) => ({ id, name, description, tags }))
}

export const getWorkforceTemplate: GetWorkforceTemplate<{ id: string }, { id: string; name: string; description: string; tags: string[]; content: WorkforceTemplateContent } | null> = async (args, context) => {
  if (!context.user) throw new HttpError(401, 'Not authenticated')
  const { getTeamTemplate } = await import('./workforceTemplateService')
  const template = await getTeamTemplate(args?.id)
  return template && { id: template.id, name: template.name, description: template.description, tags: template.tags, content: template.content }
}

export const getExistingAgentHandles: GetExistingAgentHandles<void, string[]> = async (_args, context) => {
  if (!context.user) throw new HttpError(401, 'Not authenticated')
  const agents = await prisma.agent.findMany({ select: { handle: true } })
  return agents.map((a) => a.handle)
}

/**
 * A task as the team-proposal review shows it: to a member of its project, as any task is read, and to an
 * organisation admin when it is a proposal on the Workforce Assembly board — the review notice goes to every org
 * admin, and that project's members may be only the one admin it was made with. Anyone else, and any other
 * task, gets null, as for a task that does not exist.
 */
export const getWorkforceReviewTask: GetWorkforceReviewTask<{ taskId: string }, { id: string; title: string; applicationData: Prisma.JsonValue } | null> = async ({ taskId }, context) => {
  if (!context.user) throw new HttpError(401, 'Not authenticated')
  if (typeof taskId !== 'string' || taskId === '') return null
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { id: true, title: true, applicationData: true, boardId: true },
  })
  if (!task) return null
  const mayRead = (await canSeeTask(task.id, context.user.id))
    || ((await isOrgAdmin(context.user.id))
      && (await prisma.board.count({ where: { id: task.boardId, ...MADE_FROM_WORKFORCE_ASSEMBLY } })) > 0)
  return mayRead ? { id: task.id, title: task.title, applicationData: task.applicationData } : null
}

// ── Agent template queries ────────────────────────────────────────────────────

export const getAgentTemplates: GetAgentTemplates<void, AgentTemplateSummary[]> = async (_args, context) => {
  if (!context.user) throw new HttpError(401, 'Not authenticated')
  return listAgentTemplates()
}
