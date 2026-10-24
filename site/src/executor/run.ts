/**
 * The executor's run on this site (workflows spec part 2, *From run to result*): every workflow run goes through
 * here. `startRun` checks the instruction and what the run needs, records it and answers at once; the run then
 * writes the approved files, takes the snapshot, runs the steps, has its changes scanned, writes them back only if the
 * scan found nothing, and reports the result. Whatever happens, its containers, network, folders and snapshot are
 * removed when it ends.
 *
 * The instruction — the secrets in it included — lives only in this process's memory for the run's length: it is
 * never stored or logged, and nothing sent back carries a value (adr-0148).
 */
import {
  type WorkflowRunAcceptance, type WorkflowRunInstruction, type WorkflowRunReport, type WorkflowRunResult,
  type WorkflowStepEvent, type WorkflowStopResult,
} from '@agenthix/core'
import { Logger } from '../server/utils/logger'
import { writeApprovedFiles } from './approvedFiles'
import { diffManifests } from './changeSet'
import { resolveExecutorImage } from './executorImage'
import { checkInstruction, type CheckedInstruction } from './instruction'
import { buildManifest } from './manifest'
import * as record from './runRecord'
import { createRunFolders } from './runFolders'
import { cleanUpRun } from './runCleanup'
import { runSteps } from './runSteps'
import * as seams from './seams'
import { takeSnapshot } from './snapshot'
import { LinkRefused } from './safeTree'
import { runStepContainer } from './stepRunner'
import { sendResult, sendStepEvent } from './runEvents'
import { resolveWorkspaceTarget, type WorkspaceTarget } from './workspaceTarget'
import { writeBack } from './writeBack'

const logger = new Logger('executor')

/** Runs this site carries out at once; another is refused as busy, and hq may try again. */
export const RUNS_AT_ONCE = 4

type ActiveRun = {
  state: 'waiting' | 'running'
  steps: WorkflowStepEvent[]
  abort: AbortController
  stopReason: 'stopped' | 'turned_off' | null
}

const active = new Map<string, ActiveRun>()

/** Everything the run reaches outside itself, replaceable in tests. */
export const executorDeps = {
  runStep: runStepContainer,
  resolveImage: resolveExecutorImage,
  resolveWorkspace: resolveWorkspaceTarget,
  prepareRunNetwork: (runId: string, hosts: WorkflowRunInstruction['definition']['hosts']) => seams.prepareRunNetwork(runId, hosts),
  createMasker: (m: WorkflowRunInstruction['masking']) => seams.createMasker(m),
  scanRunChanges: (input: seams.ScanRunChangesInput) => seams.scanRunChanges(input),
  sendStepEvent,
  sendResult,
  now: () => Date.now(),
}

export function isRunActive(runId: string): boolean {
  return active.has(runId)
}

function refuse(reason: Exclude<WorkflowRunAcceptance, { accepted: true }>['reason'], message: string): WorkflowRunAcceptance {
  return { accepted: false, reason, message }
}

export async function startRun(raw: unknown): Promise<WorkflowRunAcceptance> {
  const check = await checkInstruction(raw)
  if (!check.ok) return refuse(check.reason, check.message)
  const ins = check.checked.instruction
  if (active.has(ins.runId)) return refuse('already_known', `This site already has run ${ins.runId}. Nothing was changed.`)
  if (active.size >= RUNS_AT_ONCE) {
    return refuse('busy', `This site is already running ${RUNS_AT_ONCE} workflows; try again when one has ended. Nothing was changed.`)
  }
  // Claimed before the first await, so a second instruction for the same run, or one past the limit, is refused.
  const run: ActiveRun = { state: 'waiting', steps: [], abort: new AbortController(), stopReason: null }
  active.set(ins.runId, run)
  let network = null as seams.RunNetwork | null
  try {
    const admitted = await admit(ins)
    if ('accepted' in admitted) { active.delete(ins.runId); return admitted }
    try {
      network = await executorDeps.prepareRunNetwork(ins.runId, ins.definition.hosts)
    } catch (err) {
      if (err instanceof seams.RunNetworkRefused) { active.delete(ins.runId); return refuse('invalid_instruction', err.message) }
      throw err
    }
    await record.recordRunStart(ins)
    void execute(check.checked, admitted.target, admitted.imageId, network, run)
    return { accepted: true }
  } catch (err) {
    active.delete(ins.runId)
    await network?.release().catch(() => {})
    throw err
  }
}

/** The workspace and the image id to run on, or the refusal. */
async function admit(ins: WorkflowRunInstruction): Promise<{ target: WorkspaceTarget; imageId: string } | WorkflowRunAcceptance> {
  if (await record.isKnownRun(ins.runId)) return refuse('already_known', `This site already has run ${ins.runId}. Nothing was changed.`)
  const target = await executorDeps.resolveWorkspace(ins.workspace)
  if (!target) return refuse('workspace_missing', 'This site does not hold the workspace the run is for. Nothing was changed.')
  const imageId = await executorDeps.resolveImage(ins.executorImageDigest)
  if (!imageId) {
    return refuse('image_missing', `This site does not have the executor image ${ins.executorImageDigest} the version was approved with. Nothing was changed.`)
  }
  return { target, imageId }
}

async function execute(checked: CheckedInstruction, target: WorkspaceTarget, imageId: string, network: seams.RunNetwork, run: ActiveRun): Promise<void> {
  const ins = checked.instruction
  const startedAt = new Date(executorDeps.now()).toISOString()
  const deadline = executorDeps.now() + ins.definition.timeoutSeconds * 1000
  let result: WorkflowRunResult
  try {
    result = await carryOut(checked, target, imageId, network, run, startedAt, deadline)
  } catch (err) {
    logger.error(`run ${ins.runId} failed on the site`, { error: err instanceof Error ? err.message : String(err) })
    result = siteError(ins, run, startedAt, err instanceof LinkRefused
      ? `${err.message} Nothing was run, and nothing was changed.`
      : 'The site could not carry out the run. Nothing was written back.')
  }
  try {
    await record.recordResult(result)
  } catch (err) {
    logger.error(`run ${ins.runId}: its result could not be stored`, { error: err instanceof Error ? err.message : String(err) })
  }
  executorDeps.sendResult(result)
  await cleanUpRun(ins.runId, network).catch(err => logger.warn(`run ${ins.runId}: cleanup left something`, { error: String(err) }))
  active.delete(ins.runId)
}

async function carryOut(
  checked: CheckedInstruction, target: WorkspaceTarget, imageId: string, network: seams.RunNetwork, run: ActiveRun,
  startedAt: string, deadline: number,
): Promise<WorkflowRunResult> {
  const ins = checked.instruction
  const folders = await createRunFolders(ins.runId)
  await writeApprovedFiles(folders.workflow, checked.files)
  const snapshot = await takeSnapshot(target.hostDir, folders.snapshot)
  await record.recordSnapshot(ins.runId, snapshot.kind)
  run.state = 'running'

  const outcome = await runSteps({
    ins, imageId, folders, workdir: target.containerDir, networkArgs: network.dockerArgs, signal: run.abort.signal, deadline,
    stopReason: () => run.stopReason,
    emit: e => { run.steps[e.index] = e; executorDeps.sendStepEvent(e) },
    runStep: executorDeps.runStep,
    createMasker: executorDeps.createMasker,
    now: executorDeps.now,
    onStepStart: index => { void record.recordProgress(ins.runId, { currentStep: index }).catch(() => {}) },
  })
  const base = {
    runId: ins.runId, startedAt, steps: outcome.steps, printedSecretNames: outcome.printed, leaks: [], writeBack: null,
  }
  const ended = () => new Date(executorDeps.now()).toISOString()
  if (outcome.failure) {
    const stopped = outcome.failure.code === 'stopped' || outcome.failure.code === 'turned_off'
    return { ...base, state: stopped ? 'stopped' : 'failed', endedAt: ended(), failure: outcome.failure }
  }
  if (run.stopReason) {
    return { ...base, state: 'stopped', endedAt: ended(), failure: { code: run.stopReason, message: 'The run was stopped. Nothing was written back.' } }
  }

  await record.recordProgress(ins.runId, { state: 'SCANNING', currentStep: null })
  const end = await buildManifest(folders.snapshot)
  const changes = diffManifests(snapshot.manifest, end)
  const scan = await executorDeps.scanRunChanges({ runId: ins.runId, snapshotDir: folders.snapshot, outDir: folders.out, changes, material: ins.masking })
  if (scan.leaks.length > 0) {
    return {
      ...base, state: 'failed', endedAt: ended(), leaks: scan.leaks,
      failure: { code: 'secret_in_files', message: 'The run left a secret in a file, so its changes were dropped.' },
    }
  }
  // A stop that came while the scan ran still means nothing is written back.
  if (run.stopReason) {
    return { ...base, state: 'stopped', endedAt: ended(), failure: { code: run.stopReason, message: 'The run was stopped. Nothing was written back.' } }
  }
  await record.recordProgress(ins.runId, { state: 'WRITING_BACK' })
  try {
    const written = await writeBack({ runId: ins.runId, workspaceDir: target.hostDir, snapshotDir: folders.snapshot, start: snapshot.manifest, end, changes })
    return { ...base, state: 'passed', endedAt: ended(), failure: null, writeBack: written }
  } catch (err) {
    logger.error(`run ${ins.runId}: write-back failed`, { error: err instanceof Error ? err.message : String(err) })
    return {
      ...base, state: 'failed', endedAt: ended(),
      failure: { code: 'write_back_failed', message: 'The run passed, but its changes could not all be written back to the workspace.' },
    }
  }
}

function siteError(ins: WorkflowRunInstruction, run: ActiveRun, startedAt: string, message: string): WorkflowRunResult {
  return {
    runId: ins.runId, state: 'failed', startedAt, endedAt: new Date(executorDeps.now()).toISOString(),
    failure: { code: 'site_error', message },
    steps: ins.definition.steps.map((s, index) => {
      const seen = run.steps[index]
      return {
        index, name: s.name, state: seen?.state === 'passed' || seen?.state === 'failed' ? seen.state : 'skipped',
        startedAt: seen?.startedAt ?? null, endedAt: seen?.endedAt ?? null, exitCode: seen?.exitCode ?? null,
        output: seen?.outputTail ?? '', outputTruncated: seen?.outputTruncated ?? false,
      }
    }),
    printedSecretNames: [], leaks: [], writeBack: null,
  }
}

export async function stopRun(params: unknown): Promise<WorkflowStopResult> {
  const p = params as { runId?: unknown; reason?: unknown } | null
  if (!p || typeof p.runId !== 'string') throw new Error('workflow.stop needs a runId.')
  const reason = p.reason === 'turned_off' ? 'turned_off' : 'stopped'
  const run = active.get(p.runId)
  if (!run) return { stopped: false }
  run.stopReason ??= reason
  run.abort.abort()
  return { stopped: true }
}

export async function getRun(params: unknown): Promise<WorkflowRunReport | null> {
  const p = params as { runId?: unknown } | null
  if (!p || typeof p.runId !== 'string') throw new Error('workflow.get needs a runId.')
  const run = active.get(p.runId)
  if (run) return { runId: p.runId, state: run.state, steps: run.steps.filter(Boolean), result: null }
  return record.loadRunReport(p.runId)
}

/** For tests: forget every run in memory. */
export function resetExecutorForTests(): void {
  active.clear()
}
