/**
 * The model picker's server side (models from one place, part 4): which models via a provider a person may pick for a
 * conversation, and changing it. What is offered is what the resolver would let run for this conversation now —
 * lists that apply, a person's own place — worked out on the server each time, with a provider that is not working
 * listed but greyed out (models-settings/offered.ts). A pick is checked against what may run when it is made, never
 * taken from the client. A choice's `value` is the provider's id and
 * the model (access/talkingModel.ts `choiceValue`).
 */
import { HttpError, prisma } from 'wasp/server'
import type { ModelViaProvider, ResolveRequest } from '@agenthix/core'
import type { GetModelChoicesArgs, ModelChoice, ModelChoices, SetConversationModelArgs } from '../shared/conversations/protocol'
import type { ConversationHomeRef } from './contract'
import { readConversationAs, requireConversationSpeaker } from './readingRule'
import { agentChoicesFor } from './primaryAgent'
import { appendMessage } from './store/messages'
import { conversationEvents } from './coordinator/events'
import { choiceLabel, choiceValue, parseChoiceValue, talkingRequest } from './access/talkingModel'
import { choicesFor, resolve } from '../routing/resolver'
import { offeredFor, toChoice } from '../models-settings/offered'

type Ctx = { user?: { id: string } | null }

const RECENT = 3
/** How many of the person's latest conversations are looked through for their recent models. */
const RECENT_LOOKBACK = 30
const MODEL_MAX_CHARS = 200

async function offered(req: ResolveRequest): Promise<{ models: ModelChoice[]; byValue: Map<string, ModelChoice> }> {
  const { models, byValue } = await offeredFor(req)
  return { models, byValue }
}

async function recentModels(userId: string, offered: Map<string, ModelChoice>): Promise<ModelChoice[]> {
  const rows = await prisma.conversation.findMany({
    where: { openedById: userId, talkingModel: { not: null }, talkingProviderId: { not: null } },
    orderBy: { lastMessageAt: 'desc' },
    select: { talkingModel: true, talkingProviderId: true },
    take: RECENT_LOOKBACK,
  })
  const recent: ModelChoice[] = []
  for (const { talkingModel, talkingProviderId } of rows) {
    const choice = talkingModel && talkingProviderId ? offered.get(choiceValue({ providerId: talkingProviderId, model: talkingModel })) : undefined
    if (choice && !choice.notWorking && !recent.includes(choice)) recent.push(choice)
    if (recent.length === RECENT) break
  }
  return recent
}

/** A conversation not yet started: its home, as the person would start it, with the agent it would start with. */
async function homeBeforeStart(args: GetModelChoicesArgs, userId: string): Promise<ConversationHomeRef> {
  const home: unknown = args?.home
  if (home !== 'PERSON' && home !== 'PROJECT') throw new HttpError(400, 'Say which conversation, or where one would start')
  const agents = await agentChoicesFor({ home, projectId: args.projectId }, userId)
  return {
    id: '', home, projectId: home === 'PROJECT' ? args.projectId ?? null : null, taskId: null, openedById: userId,
    agentId: agents[0]?.id ?? null,
  }
}

async function choicesOf(req: ResolveRequest, userId: string, current: string | null): Promise<ModelChoices> {
  const { models, byValue } = await offered(req)
  // What it would talk on when nothing is picked: the agent's default, else the organisation's.
  const preferred = current ? null : await resolve(req)
  const fallback = preferred?.ok ? choiceValue(preferred.resolution.model) : null
  return { current: current ?? fallback, recent: await recentModels(userId, byValue), models }
}

export const getModelChoices = async (args: GetModelChoicesArgs, context: Ctx): Promise<ModelChoices> => {
  if (!context.user) throw new HttpError(401)
  const userId = context.user.id
  if (args?.conversationId === undefined) {
    const ref = await homeBeforeStart(args, userId)
    return choicesOf(await talkingRequest(ref, userId), userId, null)
  }
  const read = await readConversationAs(args.conversationId, userId)
  const row = await prisma.conversation.findUniqueOrThrow({ where: { id: read.ref.id }, select: { talkingModel: true, talkingProviderId: true } })
  const current = row.talkingModel && row.talkingProviderId ? choiceValue({ providerId: row.talkingProviderId, model: row.talkingModel }) : null
  // Someone who may not speak in it may not change its model either: nothing to pick from. Nor may anyone in a
  // task's thread, which talks on its agent's default.
  if (read.speakingRefusal || read.ref.home === 'TASK') return { current, recent: [], models: [] }
  // A conversation's pick is checked as a pick, not against the model it talks on now.
  const req = await talkingRequest({ ...read.ref, id: '' }, userId)
  return choicesOf(req, userId, current)
}

/** A pick, checked against what the resolver lets this conversation run now; refused when it may not. */
export async function requireOfferedModel(ref: ConversationHomeRef, value: unknown, userId: string): Promise<ModelChoice & { choice: ModelViaProvider }> {
  const choice = typeof value === 'string' && value.length <= MODEL_MAX_CHARS ? parseChoiceValue(value) : null
  if (!choice) throw new HttpError(400, 'Choose a model')
  const req = await talkingRequest({ ...ref, id: '' }, userId)
  const typed = new Map([[choice.providerId, [choice.model]]])
  const { snapshot, usable } = await choicesFor(req, typed)
  const chosen = usable.find(c => c.providerId === choice.providerId && c.model === choice.model)
  const shown = chosen && toChoice(chosen, snapshot)
  if (!shown) throw new HttpError(400, "That model isn't one you may use here")
  return { ...shown, choice }
}

export const TASK_THREAD_MODEL = "A task's conversation talks on its agent's default model"

export const setConversationModel = async (args: SetConversationModelArgs, context: Ctx): Promise<void> => {
  if (!context.user) throw new HttpError(401)
  const userId = context.user.id
  const ref = await requireConversationSpeaker(args?.conversationId, userId)
  if (ref.home === 'TASK') throw new HttpError(409, TASK_THREAD_MODEL)
  const row = await prisma.conversation.findUniqueOrThrow({ where: { id: ref.id }, select: { talkingModel: true, talkingProviderId: true } })
  if (row.talkingModel && row.talkingProviderId && choiceValue({ providerId: row.talkingProviderId, model: row.talkingModel }) === args.model) return

  const chosen = await requireOfferedModel(ref, args.model, userId)
  // Conditional on the model it was read with, so two changes at once record one. A turn already running keeps
  // the model it started on; the next turn reads this one.
  const { count } = await prisma.conversation.updateMany({
    where: { id: ref.id, talkingModel: row.talkingModel, talkingProviderId: row.talkingProviderId },
    data: { talkingModel: chosen.choice.model, talkingProviderId: chosen.choice.providerId },
  })
  if (count !== 1) throw new HttpError(409, "This conversation's model was changed meanwhile")

  const { message } = await appendMessage({
    conversationId: ref.id, role: 'PLATFORM', kind: 'NOTICE', authorId: userId, body: { text: `Switched to ${await choiceLabel(chosen.choice)}` },
  })
  conversationEvents.message(ref.id, message)
}
