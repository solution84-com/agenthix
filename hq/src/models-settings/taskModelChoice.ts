/**
 * The model a task, a routine or a piece of handed-off work names for its runs (models from one place, part 4): a
 * model via a provider, checked when it is saved against what the resolver lets work run in that place for that person
 * and agent. Empty follows the agent's default model, else the organisation's. The run checks it again when it
 * starts, since lists and providers change meanwhile (`agents/runModel.ts`).
 */
import { HttpError } from 'wasp/server'
import type { ResolvePlace } from '@agenthix/core'
import { parseChoiceValue } from '../conversations/access/talkingModel'
import { whyUnusable } from '../routing/decide'
import { placeOfProject } from '../routing/place'
import { readSnapshot } from '../routing/snapshot'
import { WHY } from './choices'

export const MODEL_CHOICE_MAX_CHARS = 200

/** The value to store: null for none, the picker value for a model that may run in the place, or a refusal. */
export async function checkedModelFor(
  raw: unknown, where: { place: ResolvePlace; agentId?: string | null; userId: string },
): Promise<string | null> {
  if (raw === undefined || raw === null || raw === '') return null
  if (typeof raw !== 'string' || raw.length > MODEL_CHOICE_MAX_CHARS) throw new HttpError(400, 'Choose a model')
  const pick = parseChoiceValue(raw)
  if (!pick) throw new HttpError(400, 'Choose a model')
  const req = {
    purpose: 'worker' as const, place: where.place, userId: where.userId,
    ...(where.agentId ? { agentId: where.agentId } : {}), pick,
  }
  const why = whyUnusable(pick, req, await readSnapshot(req))
  if (why) throw new HttpError(400, WHY[why.code] ?? 'That model cannot be used here')
  return raw
}

export async function checkedTaskModel(
  raw: unknown, where: { projectId: string; agentId?: string | null; userId: string },
): Promise<string | null> {
  if (raw === undefined || raw === null || raw === '') return null
  return checkedModelFor(raw, { place: await placeOfProject(where.projectId), agentId: where.agentId, userId: where.userId })
}
