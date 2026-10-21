import { HttpError } from 'wasp/server'
import { prisma } from 'wasp/server'
import { requireRole } from '../server/identity/requireRole'
import type {
  CreateBoardTemplate,
  UpdateBoardTemplate,
  DeleteBoardTemplate,
  ApplyWorkforceTemplate,
  ConfirmWorkforceTemplate,
  SaveWorkforceDraft,
  ApplyAgentTemplate,
} from 'wasp/server/operations'
import {
  createBoardTemplate as svcCreate,
  updateBoardTemplate as svcUpdate,
  deleteBoardTemplate as svcDelete,
  TemplateValidationError,
  type BoardTemplateColumn,
} from './boardTemplateService'

export const createBoardTemplate: CreateBoardTemplate<
  { name: string; description?: string; columns: any[] },
  any
> = async (args, context) => {
  await requireRole(context, 'ADMIN', 'Creating a board template')
  try {
    return await svcCreate({ ...args, columns: args.columns as BoardTemplateColumn[] })
  } catch (err) {
    if (err instanceof TemplateValidationError) throw new HttpError(400, err.message)
    throw err
  }
}

export const updateBoardTemplate: UpdateBoardTemplate<
  { id: string; name?: string; description?: string; columns?: any[] },
  any
> = async (args, context) => {
  await requireRole(context, 'ADMIN', 'Changing a board template')
  try {
    return await svcUpdate({ ...args, columns: args.columns as BoardTemplateColumn[] | undefined })
  } catch (err) {
    if (err instanceof TemplateValidationError) throw new HttpError(400, err.message)
    throw err
  }
}

export const deleteBoardTemplate: DeleteBoardTemplate<{ id: string }, any> = async ({ id }, context) => {
  await requireRole(context, 'ADMIN', 'Deleting a board template')
  return svcDelete(id)
}

// ── Workforce template actions ────────────────────────────────────────────────

import type { ApplicationSelections } from '../library/workforceTemplateService'
import { applyTemplate, readWorkforceContent } from '../library/workforceTemplateService'

type ApplyWorkforceTemplateArgs = { templateId: string; selections: ApplicationSelections }

async function applyStoredTemplate(templateId: string, selections: ApplicationSelections, userId: string) {
  const template = await prisma.workforceTemplate.findUnique({ where: { id: templateId } })
  if (!template) throw new HttpError(404, 'Template not found')
  const content = await readWorkforceContent(template)
  return applyTemplate(content, selections, userId)
}

export const applyWorkforceTemplate: ApplyWorkforceTemplate<any, any> = async ({ templateId, selections }: ApplyWorkforceTemplateArgs, context: any) => {
  await requireRole(context, 'ADMIN', 'Applying a workforce template')
  return applyStoredTemplate(templateId, selections, context.user.id)
}

type ConfirmWorkforceTemplateArgs = { taskId: string; selections: ApplicationSelections }

// Confirming a proposal applies the template. The proposal task is a record of
// the decision, not work for an agent, so it finishes on its board with no run queued.
export const confirmWorkforceTemplate: ConfirmWorkforceTemplate<any, any> = async ({ taskId, selections }: ConfirmWorkforceTemplateArgs, context: any) => {
  await requireRole(context, 'ADMIN', 'Confirming a workforce template')
  const task = await prisma.task.findUnique({ where: { id: taskId } })
  if (!task) throw new HttpError(404, 'Task not found')
  const data = (task.applicationData as any) ?? {}
  if (!data.templateId) throw new HttpError(400, 'This task does not propose a workforce template')
  if (data.confirmedSelections) throw new HttpError(409, 'This proposal has already been confirmed')

  const result = await applyStoredTemplate(data.templateId, selections, context.user.id)

  await prisma.task.update({
    where: { id: taskId },
    data: {
      column: 'done',
      status: 'DONE',
      doneAt: new Date(),
      applicationData: { ...data, confirmedSelections: selections, draftSelections: null },
    },
  })
  return result
}

type SaveWorkforceDraftArgs = { taskId: string; selections: ApplicationSelections }

export const saveWorkforceDraft: SaveWorkforceDraft<any, void> = async ({ taskId, selections }: SaveWorkforceDraftArgs, context: any) => {
  await requireRole(context, 'ADMIN', 'Saving a workforce template draft')
  const task = await prisma.task.findUnique({ where: { id: taskId } })
  if (!task) throw new HttpError(404, 'Task not found')

  await prisma.task.update({
    where: { id: taskId },
    data: {
      applicationData: { ...(task.applicationData as any ?? {}), draftSelections: selections },
    },
  })
}

// ── Agent template actions ────────────────────────────────────────────────────

import { applyAgentTemplate as svcApplyAgentTemplate } from './agentTemplateService'

type ApplyAgentTemplateArgs = { slug: string; handle: string }

export const applyAgentTemplate: ApplyAgentTemplate<ApplyAgentTemplateArgs, { id: string; handle: string }> = async ({ slug, handle }, context) => {
  await requireRole(context, 'ADMIN', 'Applying an agent template')
  try {
    return await svcApplyAgentTemplate(slug, handle, context.user!.id)
  } catch (err: any) {
    if (err.message?.includes('already exists')) throw new HttpError(409, err.message)
    throw err
  }
}
