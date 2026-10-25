/**
 * The workflow runs a conversation started (workflows spec part 5, *A run (U5)*, "In the conversation"): a run under way
 * has its card in the work bar, a finished one in the thread where it ended. A card says the step a run is on, then the result — passed with the time, or failed with the failing step and its
 * last line. A run belongs to the conversation whose operation ran the agent's run that called `run_workflow`. Nothing
 * here holds more than a step's name and one line of its masked output.
 */
import type { GetConversationWorkflowRuns } from 'wasp/server/operations'
import { HttpError, prisma } from 'wasp/server'
import { requireConversationReader } from '../conversations/readingRule'
import { mayReadPlace } from './placeAccess'

/** The newest runs a conversation shows, under way and finished together. */
const MOST_CARDS = 50
const LINE_MAX = 200

export type ConversationRunCard = {
  runId: string
  workflowId: string
  workflow: string
  state: 'waiting' | 'running' | 'passed' | 'failed' | 'stopped'
  /** The step it is on (1-based, the first one not yet done), or the one that failed; null when it has no steps. */
  stepNumber: number | null
  stepCount: number
  stepName: string | null
  /** A failed run's failing step and the last line of its output. */
  failedStep: string | null
  lastLine: string | null
  durationMs: number | null
  endedAt: Date | null
  href: string
}

type StepRow = { index: number; name: string; state: string; output: string }

function lastLineOf(output: string): string | null {
  const line = output.split('\n').map((l) => l.trim()).filter(Boolean).pop()
  return line ? (line.length > LINE_MAX ? `${line.slice(0, LINE_MAX)}…` : line) : null
}

export function runCard(run: {
  id: string; workflowId: string; state: string; startedAt: Date | null; endedAt: Date | null
  workflow: { name: string }; steps: StepRow[]
}): ConversationRunCard {
  const state = run.state.toLowerCase() as ConversationRunCard['state']
  const steps = [...run.steps].sort((a, b) => a.index - b.index)
  const failed = state === 'failed' ? steps.find((s) => s.state === 'FAILED') ?? null : null
  const current = failed ?? steps.find((s) => s.state === 'RUNNING') ?? steps.find((s) => s.state === 'WAITING') ?? null
  return {
    runId: run.id,
    workflowId: run.workflowId,
    workflow: run.workflow.name,
    state,
    stepNumber: current ? steps.indexOf(current) + 1 : null,
    stepCount: steps.length,
    stepName: current?.name ?? null,
    failedStep: failed?.name ?? null,
    lastLine: failed ? lastLineOf(failed.output) : null,
    durationMs: run.startedAt && run.endedAt ? run.endedAt.getTime() - run.startedAt.getTime() : null,
    endedAt: run.endedAt,
    href: `/workflows/${encodeURIComponent(run.workflowId)}/runs/${encodeURIComponent(run.id)}`,
  }
}

export const getConversationWorkflowRuns: GetConversationWorkflowRuns<{ conversationId: string }, ConversationRunCard[]> = async (args, context) => {
  if (!context.user) throw new HttpError(401, 'Not authenticated')
  const userId = context.user.id
  const ref = await requireConversationReader(args?.conversationId, userId)
  const ops = await prisma.operation.findMany({
    where: { conversationId: ref.id, runId: { not: null } },
    orderBy: { createdAt: 'desc' },
    take: 200,
    select: { runId: true },
  })
  const agentRunIds = [...new Set(ops.flatMap((o) => (o.runId ? [o.runId] : [])))]
  if (agentRunIds.length === 0) return []
  const runs = await prisma.workflowRun.findMany({
    where: { agentRunId: { in: agentRunIds } },
    orderBy: { createdAt: 'desc' },
    take: MOST_CARDS * 2,
    include: { workflow: { select: { name: true } }, steps: { select: { index: true, name: true, state: true, output: true } } },
  })
  const cards: ConversationRunCard[] = []
  for (const run of runs) {
    if (cards.length === MOST_CARDS) break
    if (await mayReadPlace({ type: run.placeType, id: run.placeId }, userId)) cards.push(runCard(run))
  }
  return cards
}
