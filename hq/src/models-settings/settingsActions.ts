/**
 * What the Models screens change (models from one place, part 4). The organisation's defaults and every agent's own
 * choices are organisation admins'; a list is its owner's (`modelLists.ts` says who). Each write checks the choice
 * again here against what the resolver lets run, so a screen out of date cannot save what is ruled out.
 */
import { HttpError, prisma } from 'wasp/server'
import type { ResolveRequest } from '@agenthix/core'
import { readSnapshot } from '../routing/snapshot'
import { checkModel, checkVoice } from './choices'
import { parseListInput, parseRef, requireMayEditList, saveList } from './modelLists'
import { requireOrgAdminUser } from './settingsReads'
import type { ModelInput, VoiceInput } from './types'

type Ctx = { user?: { id: string } | null }

export type ModelDefaultsInput = { conversation?: ModelInput; worker?: ModelInput; stt?: VoiceInput; tts?: VoiceInput }

type Changes = Record<string, string | null>

/** The columns of one slot that a model, or a speech choice, sets; a null choice clears them. */
async function slotColumns(
  prefix: 'conversation' | 'worker' | 'stt' | 'tts', input: ModelInput | VoiceInput, req: ResolveRequest, clearable: boolean,
): Promise<Changes> {
  const cols = (providerId: string | null, model: string | null, voice?: string | null): Changes => ({
    [`${prefix}ProviderId`]: providerId, [`${prefix}Model`]: model, ...(prefix === 'tts' ? { [`${prefix}Voice`]: voice ?? null } : {}),
  })
  if (input === null) {
    if (!clearable) throw new HttpError(400, 'A default is always set: choose one')
    return cols(null, null)
  }
  const snap = await readSnapshot(req)
  if (prefix === 'conversation' || prefix === 'worker') {
    if (typeof input !== 'string') throw new HttpError(400, 'Choose a model')
    const choice = checkModel(input, { ...req, purpose: prefix }, snap)
    return cols(choice.providerId, choice.model)
  }
  if (typeof input !== 'object') throw new HttpError(400, 'Choose a provider')
  const speech = checkVoice(input, prefix, req, snap)
  return cols(speech.providerId, speech.model || null, speech.voice ?? null)
}

const SLOTS = ['conversation', 'worker', 'stt', 'tts'] as const

async function columnsFor(args: ModelDefaultsInput, req: ResolveRequest, clearable: boolean): Promise<Changes> {
  const out: Changes = {}
  for (const slot of SLOTS) {
    const input = args?.[slot]
    if (input === undefined) continue
    Object.assign(out, await slotColumns(slot, input, req, clearable))
  }
  return out
}

/** Sets the organisation's defaults: only the ones sent change. */
export const setModelDefaults = async (args: ModelDefaultsInput, context: Ctx): Promise<void> => {
  await requireOrgAdminUser(context)
  const org = await prisma.org.findFirst({ select: { id: true } })
  if (!org) throw new HttpError(404, 'This HQ has no organisation yet')
  const data = await columnsFor(args, { purpose: 'conversation', place: { kind: 'organisation' } }, false)
  if (Object.keys(data).length === 0) return
  await prisma.org.update({ where: { id: org.id }, data: orgColumns(data) })
}

/** An agent's own models and voice: a null choice follows the organisation's again. */
export const setAgentModels = async (args: ModelDefaultsInput & { agentId: string }, context: Ctx): Promise<void> => {
  await requireOrgAdminUser(context)
  const agent = await prisma.agent.findUnique({ where: { id: args?.agentId }, select: { id: true } })
  if (!agent) throw new HttpError(404, 'That agent is gone')
  const data = await columnsFor(args, { purpose: 'conversation', place: { kind: 'organisation' }, agentId: agent.id }, true)
  if (Object.keys(data).length === 0) return
  await prisma.agentModelChoices.upsert({ where: { agentId: agent.id }, create: { agentId: agent.id, ...data }, update: data })
}

const orgColumns = (data: Changes): Changes =>
  Object.fromEntries(Object.entries(data).map(([k, v]) => [`default${k.charAt(0).toUpperCase()}${k.slice(1)}`, v]))

export const setModelList = async (args: unknown, context: Ctx): Promise<void> => {
  if (!context.user) throw new HttpError(401)
  const ref = parseRef(args)
  await requireMayEditList(ref, context.user.id)
  await saveList(ref, parseListInput(args), context.user.id)
}
