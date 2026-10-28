import type { GetBoardTemplates, GetBoardTemplate, GetWorkforceTemplates, GetWorkforceTemplate, GetExistingAgentHandles, GetWorkforceReviewTask, GetAgentTemplates } from 'wasp/server/operations'
import { HttpError } from 'wasp/server'
import { prisma } from 'wasp/server'
import { listBoardTemplates, getBoardTemplate as svcGetBoardTemplate } from './boardTemplateService'
import { listAgentTemplates, type AgentTemplateSummary } from './agentTemplateService'

export const getBoardTemplates: GetBoardTemplates<void, any> = async (_args, context) => {
  if (!context.user) throw new Error('Not authenticated')
  return listBoardTemplates()
}

export const getBoardTemplate: GetBoardTemplate<{ id: string }, any> = async ({ id }, context) => {
  if (!context.user) throw new Error('Not authenticated')
  return svcGetBoardTemplate(typeof id === 'string' ? id : '')
}

// ── Workforce template queries ────────────────────────────────────────────────

type GetWorkforceTemplatesResult = Array<{ id: string; name: string; description: string; tags: string[] }>

export const getWorkforceTemplates: GetWorkforceTemplates<void, GetWorkforceTemplatesResult> = async (_args, context) => {
  if (!context.user) throw new HttpError(401, 'Not authenticated')
  const { listTeamTemplates } = await import('./workforceTemplateService')
  return (await listTeamTemplates()).map(({ id, name, description, tags }) => ({ id, name, description, tags }))
}

export const getWorkforceTemplate: GetWorkforceTemplate<{ id: string }, { id: string; name: string; description: string; tags: string[]; content: any } | null> = async (args, context) => {
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

export const getWorkforceReviewTask: GetWorkforceReviewTask<{ taskId: string }, { id: string; title: string; applicationData: any } | null> = async ({ taskId }, context) => {
  if (!context.user) throw new HttpError(401, 'Not authenticated')
  return prisma.task.findUnique({
    where: { id: taskId },
    select: { id: true, title: true, applicationData: true },
  })
}

// ── Agent template queries ────────────────────────────────────────────────────

export const getAgentTemplates: GetAgentTemplates<void, AgentTemplateSummary[]> = async (_args, context) => {
  if (!context.user) throw new HttpError(401, 'Not authenticated')
  return listAgentTemplates()
}
