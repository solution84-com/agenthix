/**
 * What comes back from a run (workflows spec part 2, *What comes back*). The agent gets each step's state and time and
 * the last 200 lines of its masked output; the person gets all of it, live. When the changed-file scan found a secret
 * the person sees which file and which secret; the agent sees only that one was found.
 */
import { prisma, HttpError } from 'wasp/server'
import {
  AGENT_STEP_OUTPUT_LINES,
  type WorkflowLeak,
  type WorkflowRunState,
  type WorkflowRunToolResult,
  type WorkflowStepState,
  type WorkflowWriteBack,
} from '@agenthix/core'

export const LEFT_A_SECRET = 'the run left a secret in a file, so its changes were dropped'

export const RUN_VIEW_INCLUDE = {
  steps: { orderBy: { index: 'asc' as const } },
  workflow: { select: { name: true } },
  version: { select: { number: true } },
} as const

export type RunRowWithSteps = NonNullable<Awaited<ReturnType<typeof readRunRow>>>

export function readRunRow(runId: string) {
  return prisma.workflowRun.findUnique({ where: { id: runId }, include: RUN_VIEW_INCLUDE })
}

export async function requireRunRow(runId: string): Promise<RunRowWithSteps> {
  const run = await readRunRow(runId)
  if (!run) throw new HttpError(404, 'There is no such workflow run.')
  return run
}

const lower = <T extends string>(s: string) => s.toLowerCase() as T
const ms = (a: Date | null, b: Date | null) => (a && b ? b.getTime() - a.getTime() : null)

/** The last `n` lines of a text. */
export function lastLines(text: string, n: number = AGENT_STEP_OUTPUT_LINES): string {
  const trimmed = text.endsWith('\n') ? text.slice(0, -1) : text
  const lines = trimmed.split('\n')
  return lines.length <= n ? text : lines.slice(lines.length - n).join('\n')
}

const writeBackOf = (v: unknown): WorkflowWriteBack | null => (v && typeof v === 'object' ? (v as WorkflowWriteBack) : null)

function agentFailure(run: RunRowWithSteps): string | null {
  if (run.state !== 'FAILED' && run.state !== 'STOPPED') return null
  if (run.failureCode === 'secret_in_files') return LEFT_A_SECRET
  if (run.failureCode === 'turned_off') return 'the workflow was switched off while it ran, so its changes were dropped'
  if (run.state === 'STOPPED') return run.failureMessage ?? 'a person stopped the run, so its changes were dropped'
  return run.failureMessage ?? 'the run failed'
}

export function agentRunView(run: RunRowWithSteps): WorkflowRunToolResult {
  const writeBack = writeBackOf(run.writeBack)
  return {
    id: run.id,
    workflow: run.workflow.name,
    version: run.version.number,
    state: lower<WorkflowRunState>(run.state),
    failure: agentFailure(run),
    durationMs: ms(run.startedAt, run.endedAt),
    steps: run.steps.map((s) => ({
      name: s.name,
      state: lower<WorkflowStepState>(s.state),
      durationMs: ms(s.startedAt, s.endedAt),
      exitCode: s.exitCode,
      output: lastLines(s.output),
    })),
    filesChanged: writeBack?.changed ?? [],
    conflicts: writeBack?.conflicts ?? [],
  }
}

/** For the people of the place: all of each step's masked output, the leaks named, who it was for. */
export function personRunView(run: RunRowWithSteps) {
  return {
    ...agentRunView(run),
    failure: run.failureMessage,
    failureCode: run.failureCode,
    workflowId: run.workflowId,
    hash: run.hash,
    parameters: run.parameters,
    onBehalfOfUserId: run.onBehalfOfUserId,
    agentId: run.agentId,
    printedSecret: run.printedSecret,
    leaks: (Array.isArray(run.leaks) ? run.leaks : []) as WorkflowLeak[],
    startedAt: run.startedAt,
    endedAt: run.endedAt,
    createdAt: run.createdAt,
    steps: run.steps.map((s) => ({
      index: s.index,
      name: s.name,
      state: lower<WorkflowStepState>(s.state),
      durationMs: ms(s.startedAt, s.endedAt),
      exitCode: s.exitCode,
      output: s.output,
      outputTruncated: s.outputTruncated,
      startedAt: s.startedAt,
      endedAt: s.endedAt,
    })),
  }
}
