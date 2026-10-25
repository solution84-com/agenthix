/**
 * A workflow's On/Off switch (workflows spec part 1, *On and off*). Off: nobody can run it, person or agent, and a
 * run in progress is stopped. On again runs the same approved version, with no new approval. Switched only by the
 * people who may approve it, never an agent. The check that a workflow is on before each run is `runs.ts`'s.
 *
 * Every switch is kept as a `WorkflowSwitch` row — who, when, which way and why — written with the change itself.
 */
import { HttpError, prisma } from 'wasp/server'
import { AGENT_REFUSAL, requireMayAdministerPlace, type WorkflowActor, type WorkflowPlace } from './placeAccess'
import { maySwitch } from './rules'
import { siteCalls, type SiteCalls } from './siteWorkflows'

export type TurnOffResult = {
  /** The workflows this switched off; those already off are left out. */
  turnedOff: string[]
  /** Runs in progress the site stopped; the rest end when the site reports them or `runs.ts` finds them gone. */
  stopped: string[]
}

const IN_PROGRESS = ['WAITING', 'RUNNING'] as const

/** Turns one workflow on or off, for a person who administers its place. */
export async function setWorkflowEnabled(
  workflowId: string, enabled: boolean, actor: WorkflowActor, sites: SiteCalls = siteCalls,
): Promise<{ enabled: boolean }> {
  if (actor.kind !== 'person') throw new HttpError(403, AGENT_REFUSAL)
  const workflow = await prisma.workflow.findUnique({
    where: { id: workflowId },
    select: { placeType: true, placeId: true, enabled: true },
  })
  if (!workflow) throw new HttpError(404, 'There is no such workflow. Nothing was changed.')
  const place: WorkflowPlace = { type: workflow.placeType, id: workflow.placeId }
  const userId = await requireMayAdministerPlace(place, actor, enabled ? 'Turning a workflow on' : 'Turning a workflow off')
  if (workflow.enabled === enabled) return { enabled }

  if (!enabled) {
    await turnOffWorkflows([workflowId], 'turned off', userId, sites)
    return { enabled: false }
  }
  const hasApproved = (await prisma.workflowVersion.count({ where: { workflowId, state: 'APPROVED' } })) > 0
  const decision = maySwitch(true, hasApproved)
  if (!decision.ok) throw new HttpError(decision.status, decision.message)
  const at = new Date()
  await prisma.$transaction([
    prisma.workflow.update({ where: { id: workflowId }, data: { enabled: true, enabledChangedById: userId, enabledChangedAt: at } }),
    prisma.workflowSwitch.create({ data: { workflowId, enabled: true, byUserId: userId, reason: 'turned on', at } }),
  ])
  return { enabled: true }
}

/**
 * Switches these workflows off at once and asks each site to stop their runs in progress (spec part 3, S7, *Turn
 * off what uses it*). `by` is the person doing it, who must administer every one's place; it refuses before
 * changing anything otherwise. A site that can't be reached, or doesn't run workflows yet, doesn't stop the
 * switch: an off workflow can't start a run, and the run's end is reconciled when the site reports. `reason` (such
 * as "the secret STAGING_DEPLOY_KEY was turned off") goes into each switch's record.
 */
export async function turnOffWorkflows(
  ids: string[], reason: string, by: string, sites: SiteCalls = siteCalls,
): Promise<TurnOffResult> {
  const unique = [...new Set(ids)]
  if (unique.length === 0) return { turnedOff: [], stopped: [] }
  const workflows = await prisma.workflow.findMany({
    where: { id: { in: unique } },
    select: { id: true, placeType: true, placeId: true, enabled: true },
  })
  if (workflows.length !== unique.length) throw new HttpError(404, 'One of these workflows no longer exists. Nothing was changed.')
  const places = new Map(workflows.map((w) => [`${w.placeType}:${w.placeId}`, { type: w.placeType, id: w.placeId }]))
  for (const place of places.values()) {
    await requireMayAdministerPlace(place, { kind: 'person', userId: by }, 'Turning a workflow off')
  }

  const now = new Date()
  const on = workflows.filter((w) => w.enabled).map((w) => w.id)
  if (on.length) {
    await prisma.$transaction([
      prisma.workflow.updateMany({
        where: { id: { in: on }, enabled: true },
        data: { enabled: false, enabledChangedById: by, enabledChangedAt: now },
      }),
      prisma.workflowSwitch.createMany({
        data: on.map((workflowId) => ({ workflowId, enabled: false, byUserId: by, reason: reason.slice(0, 500) || null, at: now })),
      }),
    ])
  }

  const running = await prisma.workflowRun.findMany({
    where: { workflowId: { in: unique }, state: { in: [...IN_PROGRESS] } },
    select: { id: true, siteId: true },
  })
  const stopped: string[] = []
  for (const run of running) {
    const answer = await sites.stop(run.siteId, { runId: run.id, reason: 'turned_off' })
    if (answer.stopped) stopped.push(run.id)
  }
  return { turnedOff: on, stopped }
}

export type WorkflowSwitchEntry = { enabled: boolean; byUserId: string; reason: string | null; at: Date }

/** A workflow's switches, newest first. */
export function listWorkflowSwitches(workflowId: string, take = 100): Promise<WorkflowSwitchEntry[]> {
  return prisma.workflowSwitch.findMany({
    where: { workflowId },
    orderBy: { at: 'desc' },
    take,
    select: { enabled: true, byUserId: true, reason: true, at: true },
  })
}
