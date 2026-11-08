/**
 * Workforce template operations — control-plane service layer (hq/site split
 * spec §7.2, plan 5b-2 task 4). Ported from mcp/workforceTools.ts's handlers —
 * see taskOps.ts's header for the shared conventions.
 */
import { prisma } from 'wasp/server'
import { ControlPlaneError, type CallerContext } from './types'
import { requireRoleFloor } from './authorize'
import { originOfRun } from './runOnBehalfOf'
import { MADE_FROM_WORKFORCE_ASSEMBLY, PROPOSAL_IN_REVIEW, WORKFORCE_ASSEMBLY_TEMPLATE } from '../../library/systemTemplates'
import { getSiteClientUrl } from '../siteConfig'
import { requireDefaultExecutionSiteId } from '../../sites/localSite'

type Assembly = { projectId: string; inReviewColumnId: string }

async function findAssembly(): Promise<Assembly | null> {
  const type = await prisma.taskType.findFirst({
    where: { ...MADE_FROM_WORKFORCE_ASSEMBLY, archivedAt: null },
    select: { projectId: true, columns: { where: { name: PROPOSAL_IN_REVIEW }, select: { id: true } } },
    orderBy: { createdAt: 'asc' },
  })
  const column = type?.columns[0]
  return type && column ? { projectId: type.projectId, inReviewColumnId: column.id } : null
}

/**
 * The Workforce Assembly project and the column its proposals wait in: the project whose Team proposal type was made
 * from hq's own Workforce Assembly task template, made with that type the first time.
 */
async function ensureWorkforceAssembly(): Promise<Assembly> {
  const found = await findAssembly()
  if (found) return found

  const { findTemplate, templateFiles } = await import('../../assets/templates/templateAssets')
  const { readTemplatePackage } = await import('../../library/taskTemplates/templateContent')
  const { addTypesAndFields, lockProjectTypes } = await import('../../library/taskTemplates/templateInstall')
  const { ensureBuiltInTaskTypes } = await import('../../projects/taskTypes')
  const { createProject } = await import('../../projects/projectService')
  const template = await findTemplate(prisma, 'TASK_TEMPLATE', WORKFORCE_ASSEMBLY_TEMPLATE)
  if (!template) throw new ControlPlaneError('unavailable', 'propose_workforce_template: HQ has no Workforce Assembly template; it is installed when HQ starts')
  const { content } = readTemplatePackage(await templateFiles(prisma, template))
  const executionSiteId = await requireDefaultExecutionSiteId()
  const project = await createProject({
    name: 'Workforce Assembly',
    description: 'Agent-proposed workforce changes pending review.',
    executionSiteId,
  })
  await ensureBuiltInTaskTypes(project.id)
  await prisma.$transaction(async tx => {
    await lockProjectTypes(tx, project.id)
    await addTypesAndFields(tx, project.id, content, template.currentVersion.id)
  })
  const made = await findAssembly()
  if (!made) throw new ControlPlaneError('unavailable', `propose_workforce_template: the Workforce Assembly template has no ${PROPOSAL_IN_REVIEW} column`)
  return made
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

  const { projectId, inReviewColumnId } = await ensureWorkforceAssembly()
  const origin = await originOfRun(ctx, projectId, 'propose_workforce_template')

  // Created first, because its id is what the review link addresses.
  const { createTask } = await import('../../projects/projectService')
  const task = await createTask({
    title: `Proposed: ${template.name}`,
    description: `Kernel proposed the **${template.name}** workforce template.\n\n_Reason: ${args.reason}_\n\n_Preparing the review link…_`,
    projectId,
    columnId: inReviewColumnId,
    origin,
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
