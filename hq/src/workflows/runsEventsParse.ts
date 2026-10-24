/**
 * A site's workflow step events and results, checked field by field before anything is stored or shown: everything
 * off the wire is a claim. A frame that doesn't fit is dropped, never half applied. Text is clipped to core's limits,
 * keeping its end, since the end of a step's output is what tells why it stopped.
 */
import {
  WORKFLOW_RUN_FAILURES,
  WORKFLOW_STEP_EVENT_OUTPUT_MAX,
  WORKFLOW_STEP_OUTPUT_MAX,
  WORKFLOW_STEP_STATES,
  WORKFLOW_LIMITS,
  type WorkflowLeak,
  type WorkflowRunResult,
  type WorkflowStepEvent,
  type WorkflowStepResult,
  type WorkflowWriteBack,
} from '@agenthix/core'

const LIST_MAX = 1_000
const PATH_MAX = 1_024
const MESSAGE_MAX = 2_000
const SECRET_NAME = /^[A-Z][A-Z0-9_]{0,127}$/

type Rec = Record<string, unknown>
const rec = (v: unknown): Rec | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Rec) : null)
const str = (v: unknown, max: number): string | null => (typeof v === 'string' && v.length > 0 && v.length <= max ? v : null)
const tail = (v: unknown, max: number): string | null => (typeof v === 'string' ? (v.length > max ? v.slice(v.length - max) : v) : null)
const index = (v: unknown): number | null => (Number.isInteger(v) && (v as number) >= 0 && (v as number) < WORKFLOW_LIMITS.stepsMax ? (v as number) : null)
const exitCode = (v: unknown): number | null | undefined => (v === null ? null : Number.isInteger(v) ? (v as number) : undefined)

function time(v: unknown): string | null | undefined {
  if (v === null) return null
  return typeof v === 'string' && !Number.isNaN(Date.parse(v)) ? v : undefined
}

function stepState(v: unknown): WorkflowStepEvent['state'] | null {
  return typeof v === 'string' && (WORKFLOW_STEP_STATES as readonly string[]).includes(v) ? (v as WorkflowStepEvent['state']) : null
}

function stepOf(d: Rec, outputKey: 'outputTail' | 'output', outputMax: number) {
  const i = index(d.index)
  const state = stepState(d.state)
  const startedAt = time(d.startedAt)
  const endedAt = time(d.endedAt)
  const code = exitCode(d.exitCode)
  const output = tail(d[outputKey], outputMax)
  if (i === null || !state || startedAt === undefined || endedAt === undefined || code === undefined || output === null) return null
  const clipped = typeof d[outputKey] === 'string' && (d[outputKey] as string).length > outputMax
  return {
    index: i,
    name: typeof d.name === 'string' ? d.name.slice(0, WORKFLOW_LIMITS.stepNameMax) : '',
    state, startedAt, endedAt, exitCode: code, output,
    outputTruncated: d.outputTruncated === true || clipped,
  }
}

export function parseStepEvent(data: unknown): WorkflowStepEvent | null {
  const d = rec(data)
  const runId = str(d?.runId, 64)
  if (!d || !runId) return null
  const step = stepOf(d, 'outputTail', WORKFLOW_STEP_EVENT_OUTPUT_MAX)
  if (!step) return null
  const { output, ...rest } = step
  return { runId, ...rest, outputTail: output }
}

function list<T>(v: unknown, each: (x: unknown) => T | null): T[] | null {
  if (!Array.isArray(v) || v.length > LIST_MAX) return null
  const out: T[] = []
  for (const x of v) {
    const parsed = each(x)
    if (parsed === null) return null
    out.push(parsed)
  }
  return out
}

function leakOf(v: unknown): WorkflowLeak | null {
  const d = rec(v)
  const path = str(d?.path, PATH_MAX)
  const secretName = typeof d?.secretName === 'string' && SECRET_NAME.test(d.secretName) ? d.secretName : null
  return path && secretName ? { path, secretName } : null
}

function writeBackOf(v: unknown): WorkflowWriteBack | null | undefined {
  if (v === null) return null
  const d = rec(v)
  const changed = d && list(d.changed, (x) => str(x, PATH_MAX))
  const conflicts = d && list(d.conflicts, (x) => {
    const c = rec(x)
    const path = str(c?.path, PATH_MAX)
    const keptAs = str(c?.keptAs, PATH_MAX)
    return path && keptAs ? { path, keptAs } : null
  })
  return changed && conflicts ? { changed, conflicts } : undefined
}

export function parseRunResult(data: unknown): WorkflowRunResult | null {
  const d = rec(data)
  const runId = str(d?.runId, 64)
  if (!d || !runId) return null
  const state = d.state === 'passed' || d.state === 'failed' || d.state === 'stopped' ? d.state : null
  const startedAt = time(d.startedAt)
  const endedAt = time(d.endedAt)
  if (!state || !startedAt || !endedAt) return null

  let failure: WorkflowRunResult['failure'] = null
  if (d.failure !== null) {
    const f = rec(d.failure)
    const code = typeof f?.code === 'string' && (WORKFLOW_RUN_FAILURES as readonly string[]).includes(f.code) ? f.code : null
    if (!f || !code || typeof f.message !== 'string') return null
    failure = { code: code as NonNullable<WorkflowRunResult['failure']>['code'], message: f.message.slice(0, MESSAGE_MAX) }
  }
  const steps = list<WorkflowStepResult>(d.steps, (x) => {
    const s = rec(x)
    return s ? stepOf(s, 'output', WORKFLOW_STEP_OUTPUT_MAX) : null
  })
  const printedSecretNames = list(d.printedSecretNames, (x) => (typeof x === 'string' && SECRET_NAME.test(x) ? x : null))
  const leaks = list(d.leaks, leakOf)
  const writeBack = writeBackOf(d.writeBack)
  if (!steps || !printedSecretNames || !leaks || writeBack === undefined) return null
  return { runId, state, startedAt, endedAt, failure, steps, printedSecretNames: [...new Set(printedSecretNames)], leaks, writeBack }
}
