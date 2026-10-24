/**
 * A run's steps, in order, each in a container of its own with only the secrets it names (workflows spec part 2,
 * *Steps and progress*). The first step that fails ends the run and the rest are skipped; a step's own time limit and
 * the run's are both enforced; a stop removes the running step's container. Each step's state reaches hq as a step
 * event as it starts, while it runs (at most once a second) and as it ends, with output only as the masker let it out.
 */
import {
  fileNamedByRun, WORKFLOW_STEP_EVENT_OUTPUT_MAX,
  type WorkflowMaskingMaterial, type WorkflowRunFailure, type WorkflowRunInstruction, type WorkflowStepEvent,
  type WorkflowStepResult,
} from '@agenthix/core'
import { commandForStep } from './approvedFiles'
import type { RunFolders } from './runFolders'
import type { Masker } from './seams'
import { buildStepRunCommand, stepContainerName, valuesArchive } from './stepContainer'
import type { StepOutcome, StepRunInput } from './stepRunner'

const PROGRESS_EVERY_MS = 1000

export type StepsContext = {
  ins: WorkflowRunInstruction
  imageId: string
  folders: RunFolders
  workdir: string
  networkArgs: string[]
  signal: AbortSignal
  /** When the run's own time limit is up, in ms since the epoch. */
  deadline: number
  stopReason: () => 'stopped' | 'turned_off' | null
  emit: (event: WorkflowStepEvent) => void
  runStep: (input: StepRunInput) => Promise<StepOutcome>
  createMasker: (material: WorkflowMaskingMaterial) => Masker
  onStepStart?: (index: number) => void
  now?: () => number
}

export type StepsOutcome = {
  steps: WorkflowStepResult[]
  failure: { code: WorkflowRunFailure; message: string } | null
  printed: string[]
}

export function tailOf(output: string, truncated: boolean): { outputTail: string; outputTruncated: boolean } {
  if (output.length <= WORKFLOW_STEP_EVENT_OUTPUT_MAX) return { outputTail: output, outputTruncated: truncated }
  return { outputTail: output.slice(-WORKFLOW_STEP_EVENT_OUTPUT_MAX), outputTruncated: true }
}

export async function runSteps(ctx: StepsContext): Promise<StepsOutcome> {
  const now = ctx.now ?? Date.now
  const { ins } = ctx
  const files = new Set(ins.files.map(f => f.path))
  const steps: WorkflowStepResult[] = ins.definition.steps.map((s, index) => ({
    index, name: s.name, state: 'waiting', startedAt: null, endedAt: null, exitCode: null, output: '', outputTruncated: false,
  }))
  const event = (r: WorkflowStepResult): WorkflowStepEvent => ({
    runId: ins.runId, index: r.index, name: r.name, state: r.state, startedAt: r.startedAt, endedAt: r.endedAt,
    exitCode: r.exitCode, ...tailOf(r.output, r.outputTruncated),
  })
  const printed = new Set<string>()
  let failure: StepsOutcome['failure'] = null

  for (const [index, step] of ins.definition.steps.entries()) {
    const r = steps[index]!
    const stop = ctx.stopReason()
    if (failure || stop) {
      r.state = stop && !failure ? 'stopped' : 'skipped'
      if (stop && !failure) failure = stopFailure(stop)
      ctx.emit(event(r))
      continue
    }
    const remaining = ctx.deadline - now()
    if (remaining <= 0) {
      failure = { code: 'run_timeout', message: `The run went past its time limit of ${ins.definition.timeoutSeconds} s.` }
      r.state = 'skipped'
      ctx.emit(event(r))
      continue
    }
    const stepLimit = step.timeoutSeconds === null ? Infinity : step.timeoutSeconds * 1000
    const timeoutMs = Math.min(stepLimit, remaining)
    const runLimitFirst = remaining < stepLimit

    r.state = 'running'
    r.startedAt = new Date(now()).toISOString()
    ctx.onStepStart?.(index)
    ctx.emit(event(r))

    const secrets = Object.fromEntries(Object.entries(ins.steps[index]!.secrets).map(([k, v]) => [k, Buffer.from(v, 'base64')]))
    const command = buildStepRunCommand({
      runId: ins.runId,
      index,
      image: ctx.imageId,
      workflowDir: ctx.folders.workflow,
      outDir: ctx.folders.out,
      snapshotDir: ctx.folders.snapshot,
      workdir: ctx.workdir,
      readOnlyWorkspace: step.secrets.length > 0,
      limits: ins.limits,
      networkArgs: ctx.networkArgs,
      variables: ins.variables,
      command: commandForStep(step.run, files, fileNamedByRun(step.run)),
    })
    let lastSent = 0
    let outcome: StepOutcome
    try {
      outcome = await ctx.runStep({
        command,
        containerName: stepContainerName(ins.runId, index),
        stdin: valuesArchive(secrets, ins.parameters),
        maskers: { stdout: ctx.createMasker(ins.masking), stderr: ctx.createMasker(ins.masking) },
        timeoutMs,
        signal: ctx.signal,
        onOutput: (output, truncated) => {
          r.output = output
          r.outputTruncated = truncated
          if (now() - lastSent >= PROGRESS_EVERY_MS) {
            lastSent = now()
            ctx.emit(event(r))
          }
        },
      })
    } finally {
      for (const k of Object.keys(secrets)) secrets[k]!.fill(0)
    }
    r.output = outcome.output
    r.outputTruncated = outcome.outputTruncated
    r.exitCode = outcome.exitCode
    r.endedAt = new Date(now()).toISOString()
    for (const name of outcome.printed) printed.add(name)

    if (outcome.end === 'stopped') {
      r.state = 'stopped'
      failure = stopFailure(ctx.stopReason() ?? 'stopped')
    } else if (outcome.end === 'timeout') {
      r.state = 'failed'
      failure = runLimitFirst
        ? { code: 'run_timeout', message: `The run went past its time limit of ${ins.definition.timeoutSeconds} s.` }
        : { code: 'step_timeout', message: `${step.name} went past its time limit of ${step.timeoutSeconds} s.` }
    } else if (outcome.exitCode !== 0) {
      r.state = 'failed'
      failure = { code: 'step_failed', message: `${step.name} ended with exit code ${outcome.exitCode}.` }
    } else {
      r.state = 'passed'
    }
    ctx.emit(event(r))
  }
  return { steps, failure, printed: [...printed].sort() }
}

function stopFailure(reason: 'stopped' | 'turned_off'): { code: WorkflowRunFailure; message: string } {
  return reason === 'turned_off'
    ? { code: 'turned_off', message: 'The workflow was turned off, so the run was stopped. Nothing was written back.' }
    : { code: 'stopped', message: 'The run was stopped. Nothing was written back.' }
}
