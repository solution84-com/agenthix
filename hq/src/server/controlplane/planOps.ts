/**
 * Milestone operations — control-plane service layer (adr-0098). A milestone
 * is a dated goal in a project that epics belong to; an agent reads and keeps
 * them under the browser's own rule: membership of the project (adr-0101). A task's plan,
 * epic and milestone are set through update_task and create_task (taskOps.ts).
 * See taskOps.ts's header for the shared conventions.
 */
import { prisma } from 'wasp/server'
import { ControlPlaneError, type CallerContext } from './types'
import { requireProjectEntitlement } from './authorize'
import { asControlPlane } from './boardOps'
import { listMilestones, createMilestone, updateMilestone, deleteMilestone } from '../../projects/taskPlanService'

const day = (d: Date) => d.toISOString().slice(0, 10)

async function projectOf(milestoneId: string): Promise<string> {
  const m = await prisma.milestone.findUnique({ where: { id: milestoneId }, select: { projectId: true } })
  if (!m) throw new ControlPlaneError('not_found', `Milestone ${milestoneId} not found`)
  return m.projectId
}

export async function listMilestonesOp(ctx: CallerContext, args: { projectId: string }) {
  await requireProjectEntitlement(ctx, args.projectId, 'list_milestones', 'read')
  const milestones = await listMilestones(args.projectId)
  return {
    milestones: milestones.map(m => ({
      milestoneId: m.id, name: m.name, date: day(m.date),
      epics: m.epics.map(e => ({ taskId: e.id, number: e.number, title: e.title })),
    })),
    source: 'local',
  }
}

export async function createMilestoneOp(ctx: CallerContext, args: { projectId: string; name: string; date: string }) {
  await requireProjectEntitlement(ctx, args.projectId, 'create_milestone', 'work')
  const m = await asControlPlane(() => createMilestone(args))
  return { success: true, milestoneId: m.id, name: m.name, date: day(m.date), source: 'local' }
}

export async function updateMilestoneOp(ctx: CallerContext, args: { milestoneId: string; name?: string; date?: string }) {
  await requireProjectEntitlement(ctx, await projectOf(args.milestoneId), 'update_milestone', 'work')
  const m = await asControlPlane(() => updateMilestone(args))
  return { success: true, milestoneId: m.id, name: m.name, date: day(m.date), source: 'local' }
}

export async function deleteMilestoneOp(ctx: CallerContext, args: { milestoneId: string }) {
  await requireProjectEntitlement(ctx, await projectOf(args.milestoneId), 'delete_milestone', 'work')
  await deleteMilestone(args.milestoneId)
  return { success: true, milestoneId: args.milestoneId, source: 'local' }
}
