/**
 * The model a brief runs on (models from one place, part 4), in the resolver's order: the model the person's words
 * named for it; else the one its conversation talks on, so the lead and its workers run on one model; else the
 * agent's default model, else the organisation's. A brief carried on after an approval, a denial or an answer stays
 * on the model its session runs on: a change of the conversation's model applies to the next brief, never to work
 * under way.
 *
 * When a brief cannot run on its first choice — a list rules it out there, or its provider does not work — it runs on
 * the next allowed, and its arguments keep the line saying so (`modelNote`), which its run's page shows. A task's run
 * a conversation asked for keeps the line on that operation the same way (`agents/taskRunModel.ts`).
 */
import { prisma } from 'wasp/server'
import type { Agent } from '@prisma/client'
import type { Resolution, ResolveProblemCode } from '@agenthix/core'
import { chooseBoundaryRun, chooseKeptSessionRun, type RunChoice } from '../../../agents/runModel'
import { choiceLabel, parseChoiceValue } from '../../access/talkingModel'
import { openJson, sealJson } from '../../sealing'
import type { WorkerArgs } from './runReads'

export type BriefOp = {
  conversationId: string
  boundaryType: string | null
  boundaryId: string | null
  authorisedById: string
  args?: string | null
}

type WorkerSession = { userId: string; runtime: string | null; model: string | null }

const boundaryOf = (op: BriefOp, session: WorkerSession) =>
  ({ type: op.boundaryType === 'project' ? 'project' as const : 'user' as const, id: op.boundaryId ?? session.userId })

/** The model a brief runs on, and the runtime that can be given it; `carriesOn` for a run that goes on with the brief. */
export async function briefChoice(op: BriefOp, session: WorkerSession, agent: Pick<Agent, 'id'>, carriesOn = false): Promise<RunChoice> {
  const boundary = boundaryOf(op, session)
  if (carriesOn && session.runtime && session.model) {
    return chooseKeptSessionRun({ agentId: agent.id, boundary, userId: op.authorisedById, session: { runtime: session.runtime, model: session.model } })
  }
  const named = op.args ? openJson<WorkerArgs>(op.args).model : undefined
  return chooseBoundaryRun(boundary, agent.id, op.authorisedById, parseChoiceValue(named), op.conversationId)
}

const WHY: Partial<Record<ResolveProblemCode, string>> = {
  model_not_allowed: 'is not allowed for this work',
  provider_not_working: "is on a provider that isn't working",
  model_not_reached: 'is not reached by a provider here',
  subscription_outside_own_place: "is a person's own subscription, used only in their own place",
}

/** The line a run that fell back keeps: *Ran on DeepSeek V3.2 · via OpenRouter: Claude Opus 5 · via Anthropic is not allowed for this work.* */
export async function fellBackLine(r: Resolution | null): Promise<string | null> {
  if (!r?.fellBack) return null
  const [to, from] = await Promise.all([choiceLabel(r.model), choiceLabel(r.fellBack.from)])
  return `Ran on ${to}: ${from} ${WHY[r.fellBack.reason] ?? "can't be used here"}.`
}

/** Keeps on an operation's sealed arguments the line saying its run fell back from its first model; none clears it. */
export async function keepModelNote(operationId: string, args: string | null, note: string | null): Promise<void> {
  const current = args ? openJson<{ modelNote?: string } & Record<string, unknown>>(args) : {}
  if ((current.modelNote ?? null) === note) return
  const { modelNote: _old, ...rest } = current
  await prisma.operation.update({ where: { id: operationId }, data: { args: sealJson(note ? { ...rest, modelNote: note } : rest) } })
}
