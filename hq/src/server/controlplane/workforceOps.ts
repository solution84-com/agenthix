/**
 * Workforce template operations — control-plane service layer (hq/site split
 * spec §7.2, plan 5b-2 task 4). Ported from mcp/workforceTools.ts's handlers —
 * see taskOps.ts's header for the shared conventions.
 */
import { prisma } from 'wasp/server'
import { type CallerContext } from './types'
import { requireRoleFloor } from './authorize'
import { originOfRun } from './runOnBehalfOf'
import { MADE_FROM_WORKFORCE_ASSEMBLY, WORKFORCE_ASSEMBLY_TEMPLATE } from '../../library/systemTemplates'
import { getSiteClientUrl } from '../siteConfig'
import { requireDefaultExecutionSiteId } from '../../sites/localSite'

/** Finds or creates the Workforce Assembly project + board. Returns boardId + projectId. */
async function ensureWorkforceAssemblyBoard(): Promise<{ projectId: string; boardId: string }> {
  const board = await prisma.board.findFirst({
    where: MADE_FROM_WORKFORCE_ASSEMBLY,
    select: { id: true, projectId: true },
  })
  if (board) return { boardId: board.id, projectId: board.projectId }

  const { createProject, createBoard } = await import('../../projects/projectService')
  const { boardTemplateColumns } = await import('../../library/boardTemplateService')
  const executionSiteId = await requireDefaultExecutionSiteId()
  const project = await createProject({
    name: 'Workforce Assembly',
    description: 'Agent-proposed workforce changes pending review.',
    executionSiteId,
  })
  // The template's own columns: proposals wait in its In Review.
  const template = await boardTemplateColumns(WORKFORCE_ASSEMBLY_TEMPLATE)
  const newBoard = await createBoard({ projectId: project.id, name: 'Assembly', madeFromVersionId: template?.madeFromVersionId, columns: template?.columns })
  return { boardId: newBoard.id, projectId: project.id }
}

// ── list_workforce_templates ─────────────────────────────────────────────────

/** Each team template by its identity (`agenthix/dev-team`), which `propose_workforce_template` takes back. */
export async function listWorkforceTemplatesOp(_ctx: CallerContext, _args: unknown) {
  const { listTeamTemplates } = await import('../../library/workforceTemplateService')
  return (await listTeamTemplates()).map(t => ({ id: t.identity, name: t.name, description: t.description, tags: t.tags }))
}

// ── propose_workforce_template ───────────────────────────────────────────────

export async function proposeWorkforceTemplateOp(
  ctx: CallerContext,
  args: { templateId: string; reason: string },
) {
  await requireRoleFloor(ctx, 'propose_workforce_template')

  const { getTeamTemplate } = await import('../../library/workforceTemplateService')
  const template = await getTeamTemplate(args.templateId)
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
  const reviewUrl = `${clientUrl}/workforce-templates/review?taskId=${task.id}&templateId=${template.id}`

  // Update task description with a clean review link.
  await prisma.task.update({
    where: { id: task.id },
    data: {
      description: `Kernel proposed the **${template.name}** workforce template.\n\n_Reason: ${args.reason}_\n\n[Review & confirm template →](${reviewUrl})`,
      applicationData: { templateId: template.id },
    },
  })

  return {
    success: true,
    taskId: task.id,
    reviewUrl,
    message: `Proposal created. User can review at: ${reviewUrl}`,
  }
}
