/**
 * Secrets reach a live preview only through a workflow (live preview spec section 4, *Secrets*; adr-0171): the place's
 * *Start live preview* or *Reload live preview* workflow, approved by a person, naming the secrets the app needs. The
 * platform runs it and hands the secrets to the app's own container; the agent's container never holds them, and the
 * output the agent sees is masked as for any run. An app that needs no secrets starts with the agent's `start_app`.
 *
 * hq finds the workflow by its fixed name in the workspace's place, and checks the person may start runs there, that
 * it is switched on and has an approved version, and that the live preview is running. The run itself is the
 * workflows' own (`workflows/runs.ts`), with the live preview named as where its steps run (`deliver`).
 */
import { HttpError, prisma } from 'wasp/server'
import { requireMayStartRunsInPlace } from '../workflows/placeAccess'
import { reachLivePreview } from './personActions'
import { NOTHING } from './words'
import { LIVE_PREVIEW_WORKFLOW_NAMES, type LivePreviewWorkflowKind } from './workflowNames'
import { claimSecretsRun, releaseSecretsRun } from './secretsRuns'

export { LIVE_PREVIEW_WORKFLOW_NAMES, type LivePreviewWorkflowKind }

/**
 * Runs the approved workflow with the live preview as where its steps run, so the secrets it names reach the app's
 * own container. Provided by the workflows' run path once a site can take a run aimed at a live preview.
 */
export type LivePreviewWorkflowDelivery = (a: {
  place: { type: 'project' | 'user'; id: string }
  workspaceId: string
  workflowName: string
  livePreviewId: string
  /** The site the live preview runs on, as its channel knows it (`ExecutionSite.siteId`): the run goes there. */
  siteId: string
  userId: string
}) => Promise<{ runId: string }>

/**
 * Which of the place's live-preview workflows may run now: there, approved and switched on. The workspace view shows
 * *Start with secrets* and *Reload with secrets* only for these (`LivePreviewView.workflows`).
 */
export async function liveWorkflowsOf(place: { type: 'project' | 'user'; id: string }): Promise<Record<LivePreviewWorkflowKind, boolean>> {
  const found = await prisma.workflow.findMany({
    where: { placeType: place.type, placeId: place.id, name: { in: Object.values(LIVE_PREVIEW_WORKFLOW_NAMES) }, enabled: true, versions: { some: { state: 'APPROVED' } } },
    select: { name: true },
  })
  const names = new Set(found.map(w => w.name))
  return { start: names.has(LIVE_PREVIEW_WORKFLOW_NAMES.start), reload: names.has(LIVE_PREVIEW_WORKFLOW_NAMES.reload) }
}

let deliver: LivePreviewWorkflowDelivery | null = null

export function provideLivePreviewWorkflowDelivery(d: LivePreviewWorkflowDelivery | null): void {
  deliver = d
}

export async function runLivePreviewWorkflow(userId: string, livePreviewId: unknown, kind: unknown): Promise<{ runId: string }> {
  if (kind !== 'start' && kind !== 'reload') throw new HttpError(400, `Say whether to start or reload the live preview. ${NOTHING}`)
  const { row, site } = await reachLivePreview(userId, livePreviewId, 'work')
  if (row.state !== 'RUNNING') throw new HttpError(409, `The live preview is not running. Start it first. ${NOTHING}`)
  const place = { type: row.ownerType, id: row.ownerId }
  await requireMayStartRunsInPlace(place, userId, kind === 'start' ? 'Starting the live preview' : 'Reloading the live preview')
  const name = LIVE_PREVIEW_WORKFLOW_NAMES[kind]
  const workflow = await prisma.workflow.findUnique({
    where: { placeType_placeId_name: { placeType: place.type, placeId: place.id, name } },
    select: { enabled: true, versions: { where: { state: 'APPROVED' }, select: { id: true }, take: 1 } },
  })
  if (!workflow) {
    throw new HttpError(404, `This place has no ${name} workflow. Ask the agent to propose one that names the secrets the app needs; once a person approves it, it runs here. ${NOTHING}`, { code: 'noWorkflow' })
  }
  if (workflow.versions.length === 0) throw new HttpError(409, `${name} has no approved version yet. A person who administers this place approves it in Workflows. ${NOTHING}`, { code: 'notApproved' })
  if (!workflow.enabled) throw new HttpError(409, `${name} is switched off. A person who administers this place switches it on in Workflows. ${NOTHING}`, { code: 'switchedOff' })
  if (!deliver) {
    throw new HttpError(409, `This HQ's sites cannot run ${name} into a live preview yet, so its secrets were not handed to the app. ${NOTHING}`, { code: 'noDelivery' })
  }
  const run = deliver
  if (!(await claimSecretsRun(row.id))) {
    throw new HttpError(409, `${name} is already running on this live preview. Its result shows on the strip when it ends. ${NOTHING}`, { code: 'running' })
  }
  let started: { runId: string } | null = null
  try {
    started = await run({ place, workspaceId: row.workspaceId, workflowName: name, livePreviewId: row.id, siteId: site.siteId, userId })
    return started
  } finally {
    releaseSecretsRun(row.id, started ? { runId: started.runId, kind } : null)
  }
}
