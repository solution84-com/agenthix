/**
 * The model picker's server side (model access and policy spec, *The person keeps one knob*): which models a
 * person may pick for a conversation's talking model, and changing it. What is offered is worked out on the
 * server each time, and a pick is checked against it again when it is made, never taken from the client. A model
 * policy's form asks for its choices here too (`policyScope`).
 */
import { HttpError, prisma } from 'wasp/server'
import type { GetModelChoicesArgs, ModelChoice, ModelChoices, SetConversationModelArgs } from '../shared/conversations/protocol'
import type { ConversationHomeRef } from './contract'
import { readConversationAs, requireConversationSpeaker } from './readingRule'
import { agentChoicesFor } from './primaryAgent'
import { appendMessage } from './store/messages'
import { conversationEvents } from './coordinator/events'
import { latestRefusal } from './coordinator/refusal'
import { offeredModels, policyFormModels, type OfferedModel, type PolicyFormScope } from './access/offeredModels'
import { requireRole } from '../server/identity/requireRole'
import { requireProjectMember } from '../projects/membership'
import { refuseOnPersonalProject } from '../projects/personalProject'
import { makerOf, priceOf, viaLabel } from './access/modelRoutes'

type Ctx = { user?: { id: string } | null }

const RECENT = 3
/** How many of the person's latest conversations are looked through for their recent models. */
const RECENT_LOOKBACK = 30
const KNOWN_MAKERS = ['Anthropic', 'OpenAI', 'Google', 'DeepSeek']
const MODEL_MAX_CHARS = 200

function toChoice(m: OfferedModel): ModelChoice {
  return { value: m.value, label: m.label, maker: makerOf(m.value), via: viaLabel(m.provider), price: priceOf(m.costRank) }
}

const makerOrder = (maker: string) => {
  const i = KNOWN_MAKERS.indexOf(maker)
  return i === -1 ? KNOWN_MAKERS.length : i
}

/** The best-known makers first, then the rest by name; within a maker, the newest names first. */
function byMaker(a: ModelChoice, b: ModelChoice): number {
  return makerOrder(a.maker) - makerOrder(b.maker) || a.maker.localeCompare(b.maker) ||
    b.label.localeCompare(a.label, undefined, { numeric: true }) || a.via.localeCompare(b.via)
}

async function recentModels(userId: string, offered: Map<string, ModelChoice>): Promise<ModelChoice[]> {
  const rows = await prisma.conversation.findMany({
    where: { openedById: userId, talkingModel: { not: null } },
    orderBy: { lastMessageAt: 'desc' },
    select: { talkingModel: true },
    take: RECENT_LOOKBACK,
  })
  const recent: ModelChoice[] = []
  for (const { talkingModel } of rows) {
    const choice = talkingModel ? offered.get(talkingModel) : undefined
    if (choice && !recent.includes(choice)) recent.push(choice)
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

/**
 * Who may ask for a policy form's choices: those who may read that policy (modelPolicyOperations.ts), the
 * organisation's an admin's alone, since it reaches through the organisation's keys.
 */
async function policyFormScope(args: GetModelChoicesArgs, userId: string): Promise<PolicyFormScope> {
  const doing = 'Choosing models for a model policy'
  if (args.policyScope === 'org') {
    await requireRole({ user: { id: userId } }, 'ADMIN', doing)
    return { type: 'org' }
  }
  if (args.policyScope === 'user') return { type: 'user', userId }
  if (args.policyScope !== 'project' || typeof args.projectId !== 'string') throw new HttpError(400, 'Name a project')
  await requireProjectMember(args.projectId, userId, doing)
  await refuseOnPersonalProject(args.projectId, 'A model policy')
  return { type: 'project', projectId: args.projectId, userId }
}

async function choicesOf(models: OfferedModel[], userId: string, current: string | null): Promise<ModelChoices> {
  const choices = models.map(toChoice).sort(byMaker)
  return { current, recent: await recentModels(userId, new Map(choices.map(c => [c.value, c]))), models: choices }
}

export const getModelChoices = async (args: GetModelChoicesArgs, context: Ctx): Promise<ModelChoices> => {
  if (!context.user) throw new HttpError(401)
  const userId = context.user.id
  if (args?.policyScope !== undefined) return choicesOf(await policyFormModels(await policyFormScope(args, userId)), userId, null)

  let ref: ConversationHomeRef
  let talkingModel: string | null = null
  if (args?.conversationId !== undefined) {
    const read = await readConversationAs(args.conversationId, userId)
    const row = await prisma.conversation.findUniqueOrThrow({ where: { id: read.ref.id }, select: { talkingModel: true } })
    // Someone who may not speak in it may not change its model either: nothing to pick from. Nor may anyone in a
    // task's thread, whose model is the project policy's (model access spec).
    if (read.speakingRefusal || read.ref.home === 'TASK') return { current: row.talkingModel, recent: [], models: [] }
    ref = read.ref
    talkingModel = row.talkingModel
  } else {
    ref = await homeBeforeStart(args, userId)
  }

  const refused = talkingModel ? await latestRefusal(ref.id) : null
  const { models, preferred } = await offeredModels(ref, refused)
  return choicesOf(models, userId, talkingModel ?? preferred)
}

/** A pick, checked against what this home offers the person now; refused when it is not offered. */
export async function requireOfferedModel(
  ref: ConversationHomeRef,
  model: unknown,
  refused: Awaited<ReturnType<typeof latestRefusal>> = null,
): Promise<OfferedModel> {
  if (typeof model !== 'string' || model === '' || model.length > MODEL_MAX_CHARS) throw new HttpError(400, 'Choose a model')
  const { models } = await offeredModels(ref, refused)
  const chosen = models.find(m => m.value === model)
  if (!chosen) throw new HttpError(400, "That model isn't one the model access and policy here allow")
  return chosen
}

export const TASK_THREAD_MODEL = "A task's conversation talks on its project's model, set in the project's model policy"

export const setConversationModel = async (args: SetConversationModelArgs, context: Ctx): Promise<void> => {
  if (!context.user) throw new HttpError(401)
  const userId = context.user.id
  const ref = await requireConversationSpeaker(args?.conversationId, userId)
  if (ref.home === 'TASK') throw new HttpError(409, TASK_THREAD_MODEL)
  const row = await prisma.conversation.findUniqueOrThrow({ where: { id: ref.id }, select: { talkingModel: true } })
  if (row.talkingModel === args.model) return

  const chosen = await requireOfferedModel(ref, args.model, await latestRefusal(ref.id))
  // Conditional on the model it was read with, so two changes at once record one. A turn already running keeps
  // the model it started on; the next turn reads this one.
  const { count } = await prisma.conversation.updateMany({
    where: { id: ref.id, talkingModel: row.talkingModel },
    data: { talkingModel: chosen.value, talkingProvider: chosen.provider, accessOwnerType: chosen.owner, accessKind: 'API_KEY' },
  })
  if (count !== 1) throw new HttpError(409, "This conversation's model was changed meanwhile")

  const { message } = await appendMessage({
    conversationId: ref.id, role: 'PLATFORM', kind: 'NOTICE', authorId: userId, body: { text: `Switched to ${chosen.label}` },
  })
  conversationEvents.message(ref.id, message)
}
