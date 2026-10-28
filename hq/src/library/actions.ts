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
  type BoardTemplateSummary,
} from './boardTemplateService'
import { requireMay, organisationTarget } from '../assets/policyActors'
import { NoOrganisationError } from '../assets/organisationPublisher'

/** Board templates are Library assets: the one policy decides who publishes and who removes them (D28). */
async function asTemplateHttp<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work()
  } catch (err) {
    if (err instanceof TemplateValidationError) throw new HttpError(err.status, err.message)
    if (err instanceof NoOrganisationError) throw new HttpError(409, err.message)
    throw err
  }
}

/** What the editor sends for a column; the service checks every field (`assets/install/templateFiles.ts`). */
type ColumnArg = { name: string; label: string; status: string; color: string; description?: string; hint?: string; autoQueue?: boolean }

export const createBoardTemplate: CreateBoardTemplate<
  { name: string; description?: string; columns: ColumnArg[] },
  BoardTemplateSummary
> = async (args, context) => {
  const actor = await requireMay(context, 'publish', await organisationTarget(prisma))
  return asTemplateHttp(() => svcCreate({ name: args?.name, description: args?.description, columns: Array.isArray(args?.columns) ? args.columns : [], byId: actor.userId }))
}

export const updateBoardTemplate: UpdateBoardTemplate<
  { id: string; name?: string; description?: string; columns?: ColumnArg[] },
  BoardTemplateSummary
> = async (args, context) => {
  const actor = await requireMay(context, 'publish', await organisationTarget(prisma))
  return asTemplateHttp(() => svcUpdate({
    id: String(args?.id ?? ''), name: args?.name, description: args?.description,
    columns: Array.isArray(args?.columns) ? args.columns : undefined, byId: actor.userId,
  }))
}

export const deleteBoardTemplate: DeleteBoardTemplate<{ id: string }, void> = async (args, context) => {
  const actor = await requireMay(context, 'remove', await organisationTarget(prisma))
  return asTemplateHttp(() => svcDelete(String(args?.id ?? ''), actor.userId))
}

// ── Workforce template actions ────────────────────────────────────────────────

import type { ApplicationSelections } from '../library/workforceTemplateService'
import { applyTeamTemplate } from '../library/workforceTemplateService'

type ApplyWorkforceTemplateArgs = { templateId: string; selections: ApplicationSelections }

function applyStoredTemplate(templateId: string, selections: ApplicationSelections, userId: string) {
  return applyTeamTemplate(templateId, selections, userId)
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

import { applyAgentTemplate as svcApplyAgentTemplate, type ApplyAgentTemplateResult } from './agentTemplateService'

/** `id` is the template's asset id; `slug` its identity or name, as before templates were assets. */
type ApplyAgentTemplateArgs = { id?: string; slug?: string; handle: string }

export const applyAgentTemplate: ApplyAgentTemplate<ApplyAgentTemplateArgs, ApplyAgentTemplateResult> = async (args, context) => {
  await requireRole(context, 'ADMIN', 'Applying an agent template')
  const ref = args?.id ?? args?.slug
  if (typeof ref !== 'string' || typeof args?.handle !== 'string') throw new HttpError(400, 'Name the template and the handle.')
  try {
    return await svcApplyAgentTemplate(ref, args.handle, context.user!.id)
  } catch (err) {
    if (err instanceof Error && err.message.includes('already exists')) throw new HttpError(409, err.message)
    throw err
  }
}
