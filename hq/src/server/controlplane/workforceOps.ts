/**
 * Workforce template operations — control-plane service layer (hq/site split
 * spec §7.2, plan 5b-2 task 4). Ported from mcp/workforceTools.ts's handlers —
 * see taskOps.ts's header for the shared conventions.
 */
import { prisma } from 'wasp/server'
import { type CallerContext } from './types'
import { requireRoleFloor } from './authorize'
import { originOfRun } from './runOnBehalfOf'
import { SYSTEM_TEMPLATE_IDS } from '../../library/systemTemplates'
import { getSiteClientUrl } from '../siteConfig'
import { requireDefaultExecutionSiteId } from '../../sites/localSite'

/** Finds or creates the Workforce Assembly project + board. Returns boardId + projectId. */
async function ensureWorkforceAssemblyBoard(): Promise<{ projectId: string; boardId: string }> {
  const board = await prisma.board.findFirst({
    where: { templateId: SYSTEM_TEMPLATE_IDS.WORKFORCE_ASSEMBLY },
    select: { id: true, projectId: true },
  })
  if (board) return { boardId: board.id, projectId: board.projectId }

  const { createProject, createBoard } = await import('../../projects/projectService')
  const { readBoardColumns } = await import('../../library/boardTemplateService')
  const executionSiteId = await requireDefaultExecutionSiteId()
  const project = await createProject({
    name: 'Workforce Assembly',
    description: 'Agent-proposed workforce changes pending review.',
    executionSiteId,
  })
  const template = await prisma.boardTemplate.findUnique({ where: { id: SYSTEM_TEMPLATE_IDS.WORKFORCE_ASSEMBLY } })
  // The template's own columns: proposals wait in its In Review.
  const columns = template ? await readBoardColumns(template.assetPath, template.isSystem) : undefined
  const newBoard = await createBoard({ projectId: project.id, name: 'Assembly', templateId: template?.id, columns })
  return { boardId: newBoard.id, projectId: project.id }
}

// ── list_workforce_templates ─────────────────────────────────────────────────

export async function listWorkforceTemplatesOp(_ctx: CallerContext, _args: unknown) {
  return prisma.workforceTemplate.findMany({
    select: { id: true, name: true, description: true, tags: true },
    orderBy: { name: 'asc' },
  })
}

// ── propose_workforce_template ───────────────────────────────────────────────

export async function proposeWorkforceTemplateOp(
  ctx: CallerContext,
  args: { templateId: string; reason: string },
) {
  await requireRoleFloor(ctx, 'propose_workforce_template')

  const template = await prisma.workforceTemplate.findUnique({ where: { id: args.templateId } })
  // Pinned shape (SC-210): an unknown template is a normal { success: false, error }
  // result, not a ControlPlaneError throw — do not "fix" this into a throw later.
  if (!template) return { success: false, error: `Template '${args.templateId}' not found` }

  const { boardId, projectId } = await ensureWorkforceAssemblyBoard()
  const origin = await originOfRun(ctx, projectId, 'propose_workforce_template')

  // Created first, because its id is what the review link addresses.
  const agg = await prisma.task.aggregate({ where: { projectId }, _max: { number: true } })
  const taskNumber = (agg._max.number ?? 0) + 1
  const task = await prisma.task.create({
    data: {
      title: `Proposed: ${template.name}`,
      description: `Kernel proposed the **${template.name}** workforce template.\n\n_Reason: ${args.reason}_\n\n_Preparing the review link…_`,
      projectId,
      boardId,
      column: 'in_review',
      status: 'IN_PROGRESS',
      number: taskNumber,
      onBehalfOfUserId: origin.onBehalfOfUserId,
    },
  })

  // Build review URL
  const clientUrl = getSiteClientUrl()
  const reviewUrl = `${clientUrl}/workforce-templates/review?taskId=${task.id}&templateId=${args.templateId}`

  // Update task description with a clean review link.
  await prisma.task.update({
    where: { id: task.id },
    data: {
      description: `Kernel proposed the **${template.name}** workforce template.\n\n_Reason: ${args.reason}_\n\n[Review & confirm template →](${reviewUrl})`,
      applicationData: { templateId: args.templateId },
    },
  })

  return {
    success: true,
    taskId: task.id,
    reviewUrl,
    message: `Proposal created. User can review at: ${reviewUrl}`,
  }
}
