import type { GetBoardTemplates, GetBoardTemplate, GetWorkforceTemplates, GetWorkforceTemplate, GetExistingAgentHandles, GetWorkforceReviewTask, GetAgentTemplates } from 'wasp/server/operations'
import { HttpError } from 'wasp/server'
import { prisma } from 'wasp/server'
import { listBoardTemplates, getBoardTemplate as svcGetBoardTemplate } from './boardTemplateService'

export const getBoardTemplates: GetBoardTemplates<void, any> = async (_args, context) => {
  if (!context.user) throw new Error('Not authenticated')
  return listBoardTemplates()
}

export const getBoardTemplate: GetBoardTemplate<{ id: string }, any> = async ({ id }, context) => {
  if (!context.user) throw new Error('Not authenticated')
  return svcGetBoardTemplate(id)
}

// ── Workforce template queries ────────────────────────────────────────────────

type GetWorkforceTemplatesResult = Array<{ id: string; name: string; description: string; tags: string[] }>

export const getWorkforceTemplates: GetWorkforceTemplates<void, GetWorkforceTemplatesResult> = async (_args, context) => {
  if (!context.user) throw new HttpError(401, 'Not authenticated')
  return prisma.workforceTemplate.findMany({
    select: { id: true, name: true, description: true, tags: true },
    orderBy: { name: 'asc' },
  })
}

export const getWorkforceTemplate: GetWorkforceTemplate<{ id: string }, { id: string; name: string; description: string; tags: string[]; content: any } | null> = async ({ id }, context) => {
  if (!context.user) throw new HttpError(401, 'Not authenticated')
  const template = await prisma.workforceTemplate.findUnique({ where: { id } })
  if (!template) return null
  const { readWorkforceContent } = await import('./workforceTemplateService')
  const content = await readWorkforceContent(template)
  return { id: template.id, name: template.name, description: template.description, tags: template.tags, content }
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

type AgentTemplateSummary = { id: string; slug: string; name: string; handle: string }

export const getAgentTemplates: GetAgentTemplates<void, AgentTemplateSummary[]> = async (_args, context) => {
  if (!context.user) throw new HttpError(401, 'Not authenticated')
  return prisma.agentTemplate.findMany({
    select: { id: true, slug: true, name: true, handle: true },
    orderBy: { name: 'asc' },
  })
}
