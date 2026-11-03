/**
 * Starting and stopping a workflow run (workflows spec part 2, *From run to result*, hq's steps 1–3; adr-0147).
 *
 * 1. **Asked** by a person who may start runs in the place, or by an agent's run on behalf of its person, who must
 *    be able to as well (ADR-0095, adr-0101).
 * 2. **Checked** (`runsChecks.ts`): on, approved here with its content still hashing as approved, parameters, the
 *    agent's runs for the hour, every secret and variable still there. The run is recorded in the same transaction
 *    as the count, so two agents' runs at once can't both pass the limit.
 * 3. **Read from GitHub**, for the starter workflows: a protected target branch, and the environment
 *    `set-github-secrets` sets its secrets on (`starters/runGuards.ts`).
 * 4. **Sent** to the site holding the place's storage: the values, decrypted only now and only in memory; the
 *    masking material for every value of the place. Each secret given is recorded (S8).
 *
 * A refusal before the site accepted leaves nothing behind: the run's row is removed, and the message ends "Nothing
 * was changed." A site that may have received the run but didn't answer keeps the run, failed, with its use
 * recorded, since it may have run.
 */
import { HttpError, prisma } from 'wasp/server'
import { Prisma } from '@prisma/client'
import { isLivePreviewWorkflowName, type WorkflowDefinition, type WorkflowRunWorkspace } from '@agenthix/core'
import { resolveStorageSite } from '../storage/storageSite'
import { listPlaceSecretNames, listPlaceVariableNames, recordUse, valuesForRun } from '../secrets/store'
import { variableValuesForRun } from '../secrets/variables'
import { SecretsRefusal } from '../secrets/refusal'
import { requireMayStartRunsInPlace, type WorkflowPlace } from './placeAccess'
import { checkRunStart } from './runsChecks'
import { buildRunInstruction } from './runsInstruction'
import { mintIntegrationValues, revokeMintedTokens, unexpiredMintedValues } from './integrationValues'
import { runSiteCalls, type RunSiteCalls } from './runsSite'
import { siteCalls, type SiteCalls } from './siteWorkflows'
import { storedVersionMatches } from './versionContent'
import { rememberRunSession } from './runsLive'
import { guardStarterRun } from './starters/runGuards'
import { livePreviewWorkflowRefusal } from './livePreviewRefusal'
import { requireFeature } from '../features/requireFeature'

export { livePreviewWorkflowRefusal }

/** Who presses Run: a person, or an agent's run on behalf of one. */
export type RunStarter =
  | { kind: 'person'; userId: string }
  | { kind: 'agent'; agentId: string; agentRunId: string; onBehalfOfUserId: string; sessionId: string }

export type StartRunInput = {
  /** The place the run is asked from. */
  place: WorkflowPlace
  workspace: WorkflowRunWorkspace
  workflow: { id: string } | { name: string }
  parameters: Record<string, unknown>
  starter: RunStarter
  /**
   * A place's *Start live preview* or *Reload live preview* (`livePreviews/workflowSecrets.ts`): the run goes to the
   * site the live preview runs on, works on its copy, and hands the secrets its steps name to its app's container.
   */
  livePreview?: { id: string; siteId: string }
}

export type RunDeps = { site: RunSiteCalls; stop: Pick<SiteCalls, 'stop'>; guard?: typeof guardStarterRun }
const defaultDeps: RunDeps = { site: runSiteCalls, stop: siteCalls, guard: guardStarterRun }

const HOUR_MS = 60 * 60 * 1000
const IN_PROGRESS = ['WAITING', 'RUNNING'] as const

function refuseAgentLivePreviewWorkflow(starter: RunStarter, name: string | null): void {
  if (starter.kind === 'agent' && name !== null && isLivePreviewWorkflowName(name)) throw new HttpError(403, livePreviewWorkflowRefusal(name))
}

const personOf = (s: RunStarter) => (s.kind === 'person' ? s.userId : s.onBehalfOfUserId)

function loadWorkflow(place: WorkflowPlace, ref: StartRunInput['workflow']) {
  const select = {
    id: true, name: true, placeType: true, placeId: true, enabled: true, agentRunsPerHour: true,
    versions: { where: { state: 'APPROVED' as const }, include: { files: true, approvals: true } },
  }
  return 'id' in ref
    ? prisma.workflow.findUnique({ where: { id: ref.id }, select })
    : prisma.workflow.findUnique({ where: { placeType_placeId_name: { placeType: place.type, placeId: place.id, name: ref.name } }, select })
}

export async function startWorkflowRun(input: StartRunInput, deps: RunDeps = defaultDeps): Promise<{ runId: string }> {
  const { place, workspace, starter } = input
  refuseAgentLivePreviewWorkflow(starter, 'name' in input.workflow ? input.workflow.name : null)
  if (starter.kind === 'agent' && input.livePreview) throw new HttpError(403, livePreviewWorkflowRefusal('A live preview\'s workflow'))
  // A run into a live preview's container (its secrets with it) only while the live preview's flag is on (adr-0172).
  if (input.livePreview) await requireFeature('livePreview')
  if (workspace.ownerType !== place.type || workspace.ownerId !== place.id) {
    throw new HttpError(400, 'A workflow runs on a workspace of its own place. Nothing was changed.')
  }
  const person = personOf(starter)
  await requireMayStartRunsInPlace(place, person, 'Running a workflow')

  const workflow = await loadWorkflow(place, input.workflow)
  if (!workflow) {
    const name = 'name' in input.workflow ? input.workflow.name : 'that workflow'
    throw new HttpError(404, `There is no workflow ${name} in this place; list_workflows shows its workflows. Nothing was changed.`)
  }
  refuseAgentLivePreviewWorkflow(starter, workflow.name)
  const wPlace: WorkflowPlace = { type: workflow.placeType, id: workflow.placeId }
  const version = workflow.versions[0] ?? null
  const definition = version ? (version.definition as unknown as WorkflowDefinition) : null
  const approved = version && definition ? {
    number: version.number,
    definition,
    approvedHere: version.approvals.some((a) => a.placeType === wPlace.type && a.placeId === wPlace.id && a.hash === version.hash),
    contentMatches: await storedVersionMatches(version, version.hash),
  } : null
  const [secretNames, variableNames] = await Promise.all([listPlaceSecretNames(wPlace), listPlaceVariableNames(wPlace)])
  const siteId = input.livePreview?.siteId
    ?? await resolveStorageSite({ ownerType: workspace.ownerType, ownerId: workspace.ownerId, workspaceId: workspace.workspaceId })

  const recorded = await prisma.$transaction(async (tx) => {
    // Writing the workflow's row first serialises runs of it, so the count below is the count when this one is made.
    await tx.workflow.update({ where: { id: workflow.id }, data: { updatedAt: new Date() } })
    const agentRunsInLastHour = starter.kind === 'agent'
      ? await tx.workflowRun.count({ where: { workflowId: workflow.id, agentId: starter.agentId, createdAt: { gte: new Date(Date.now() - HOUR_MS) } } })
      : null
    const check = checkRunStart({
      askedFrom: place,
      workflow: { name: workflow.name, place: wPlace, enabled: workflow.enabled, agentRunsPerHour: workflow.agentRunsPerHour },
      approved,
      parameters: input.parameters,
      agentRunsInLastHour,
      secretNames,
      variableNames,
    })
    if (!check.ok) return check
    const run = await tx.workflowRun.create({
      data: {
        workflowId: workflow.id,
        versionId: version!.id,
        hash: version!.hash,
        placeType: wPlace.type,
        placeId: wPlace.id,
        workspaceId: workspace.workspaceId,
        siteId,
        onBehalfOfUserId: person,
        agentId: starter.kind === 'agent' ? starter.agentId : null,
        agentRunId: starter.kind === 'agent' ? starter.agentRunId : null,
        parameters: check.parameters as Prisma.InputJsonValue,
        steps: { create: definition!.steps.map((s, index) => ({ index, name: s.name })) },
      },
      select: { id: true },
    })
    return { ok: true as const, runId: run.id, parameters: check.parameters }
  })
  if (!recorded.ok) throw new HttpError(recorded.status, recorded.message)

  const runId = recorded.runId
  const runSecretNames = [...new Set(definition!.steps.flatMap((s) => s.secrets))]
  const held: Buffer[] = []
  let outcome: Awaited<ReturnType<RunSiteCalls['run']>>
  try {
    // What GitHub says of a starter's target, read before any token for the run is minted (spec part 4).
    await (deps.guard ?? guardStarterRun)({
      workflowName: workflow.name,
      parameters: recorded.parameters,
      location: { place: wPlace, siteId, workspaceId: workspace.workspaceId, person },
    })
    const minted = await mintIntegrationValues({ runId, place: wPlace, definition: definition! })
    const placeSecrets = await valuesForRun(wPlace, secretNames)
    const mintedForMasking = await unexpiredMintedValues(wPlace)
    held.push(...placeSecrets.values(), ...minted.values.map((m) => m.value), ...mintedForMasking.map((m) => m.value))
    const instruction = buildRunInstruction({
      runId,
      version: { ...version!, definition: definition! },
      workspace,
      placeSecrets,
      minted: new Map(minted.values.map((m) => [m.name, m.value])),
      mintedForMasking,
      variables: await variableValuesForRun(wPlace, definition!.variables),
      parameters: recorded.parameters,
      github: minted.github,
      livePreview: input.livePreview ? { livePreviewId: input.livePreview.id } : undefined,
    })
    outcome = await deps.site.run(siteId, instruction)
  } catch (err) {
    await forget(runId, wPlace)
    if (err instanceof SecretsRefusal) throw new HttpError(409, err.message)
    throw err
  } finally {
    for (const b of held) b.fill(0)
  }

  if (outcome.sent === 'refused' || outcome.sent === 'unreachable') {
    await forget(runId, wPlace)
    throw new HttpError(outcome.sent === 'refused' ? 409 : 503, outcome.sent === 'refused'
      ? outcome.message
      : 'The Execution Site that holds this place\'s storage can\'t be reached; try again once it is back. Nothing was changed.')
  }
  const used = runSecretNames.filter((n) => secretNames.includes(n))
  await recordUse(wPlace, runId, used, person)
  if (starter.kind === 'agent') rememberRunSession(runId, starter.sessionId)
  if (outcome.sent === 'unknown') {
    await prisma.workflowRun.updateMany({
      where: { id: runId, state: { in: [...IN_PROGRESS] } },
      data: {
        state: 'FAILED', failureCode: 'site_error', endedAt: new Date(),
        failureMessage: 'HQ lost touch with the Execution Site as it started this run, so it may have run in part. HQ asked the site to stop it.',
      },
    })
    await deps.stop.stop(siteId, { runId, reason: 'stopped' }).catch(() => undefined)
    await revokeMintedTokens(runId, wPlace).catch(() => undefined)
  }
  return { runId }
}

/** A minted token is ended before its row goes with the run's. */
async function forget(runId: string, place: WorkflowPlace): Promise<void> {
  await revokeMintedTokens(runId, place).catch(() => undefined)
  await prisma.workflowRun.delete({ where: { id: runId } }).catch(() => undefined)
}

/** Stops a run in progress, for anyone who could start it (spec part 2, *Steps and progress*). */
export async function stopWorkflowRun(runId: string, userId: string, sites: Pick<SiteCalls, 'stop'> = siteCalls): Promise<{ stopped: boolean }> {
  const run = await prisma.workflowRun.findUnique({ where: { id: runId }, select: { placeType: true, placeId: true, siteId: true, state: true } })
  if (!run) throw new HttpError(404, 'There is no such workflow run. Nothing was changed.')
  await requireMayStartRunsInPlace({ type: run.placeType, id: run.placeId }, userId, 'Stopping a workflow run')
  if (run.state !== 'WAITING' && run.state !== 'RUNNING') return { stopped: false }
  const answer = await sites.stop(run.siteId, { runId, reason: 'stopped' })
  if (!answer.reached) {
    throw new HttpError(503, 'The Execution Site running this workflow can\'t be reached; try again once it is back. Nothing was changed.')
  }
  return { stopped: answer.stopped }
}
