/**
 * What the resolver reads to decide a call (models from one place, part 4): the providers, the organisation's and the
 * agent's choices, every list that applies, the model a conversation talks on (for its own calls and the work it
 * hands off), and the billing profile of the place.
 * `decide.ts` holds the rule; this module only reads.
 *
 * Lists that apply: the organisation's, the agent's, the project's for a shared project, and the person's — the
 * person asking, and in a person's own place its owner (a personal project has no list of its own).
 */
import { prisma } from 'wasp/server'
import type { ModelListOwner, ModelViaProvider, ResolvePlace, ResolveRequest } from '@agenthix/core'
import type { AppliedList } from './listMatch'
import type { Layers, RouteProvider, Snapshot, VoiceChoice } from './decide'

const PROVIDER = { id: true, name: true, vendor: true, credentialKind: true, state: true, ownerUserId: true } as const

/**
 * The organisation's providers, oldest first, and a person's own Claude subscription once its terms are accepted.
 * `pickedId` also reads a subscription a pick names, so a pick of one outside its owner's place is refused for that
 * reason rather than as a provider that does not exist.
 */
export async function routeProviders(userId: string | null, pickedId?: string): Promise<RouteProvider[]> {
  const subscription = { credentialKind: 'subscription' as const, termsAcceptedAt: { not: null } }
  const rows = await prisma.aiProvider.findMany({
    where: {
      OR: [
        { ownerUserId: null },
        ...(userId ? [{ ownerUserId: userId, ...subscription }] : []),
        ...(pickedId ? [{ id: pickedId, ownerUserId: { not: null }, ...subscription }] : []),
      ],
    },
    select: PROVIDER,
    orderBy: { createdAt: 'asc' },
  })
  // A person's own subscription is offered first in their own place: it is theirs, and included.
  return [...rows.filter(r => r.ownerUserId !== null), ...rows.filter(r => r.ownerUserId === null)]
}

const pair = (providerId: string | null, model: string | null): ModelViaProvider | null =>
  providerId && model ? { providerId, model } : null

const voice = (providerId: string | null, model: string | null, v?: string | null): VoiceChoice =>
  providerId ? { providerId, model: model ?? '', ...(v ? { voice: v } : {}) } : null

type ChoiceRow = {
  conversationProviderId: string | null; conversationModel: string | null
  sttProviderId: string | null; sttModel: string | null
  ttsProviderId: string | null; ttsModel: string | null; ttsVoice: string | null
}

function layersOf(r: ChoiceRow): Layers {
  return {
    conversation: pair(r.conversationProviderId, r.conversationModel),
    stt: voice(r.sttProviderId, r.sttModel),
    tts: voice(r.ttsProviderId, r.ttsModel, r.ttsVoice),
  }
}

export async function orgLayers(): Promise<{ orgId: string | null; layers: Layers }> {
  const org = await prisma.org.findFirst({
    select: {
      id: true, defaultConversationProviderId: true, defaultConversationModel: true, defaultSttProviderId: true,
      defaultSttModel: true, defaultTtsProviderId: true, defaultTtsModel: true, defaultTtsVoice: true,
    },
  })
  if (!org) return { orgId: null, layers: { conversation: null, stt: null, tts: null } }
  return {
    orgId: org.id,
    layers: layersOf({
      conversationProviderId: org.defaultConversationProviderId, conversationModel: org.defaultConversationModel,
      sttProviderId: org.defaultSttProviderId, sttModel: org.defaultSttModel,
      ttsProviderId: org.defaultTtsProviderId, ttsModel: org.defaultTtsModel, ttsVoice: org.defaultTtsVoice,
    }),
  }
}

async function agentLayers(agentId: string | undefined): Promise<{ name: string | null; layers: Layers | null }> {
  if (!agentId) return { name: null, layers: null }
  const agent = await prisma.agent.findUnique({ where: { id: agentId }, select: { name: true, modelChoices: true } })
  return { name: agent?.name ?? null, layers: agent?.modelChoices ? layersOf(agent.modelChoices) : null }
}

/** The lists that apply to a call in this place, for this agent and person. */
export async function listsFor(orgId: string | null, req: Pick<ResolveRequest, 'place' | 'agentId' | 'userId'>): Promise<AppliedList[]> {
  const owners: { owner: ModelListOwner; ownerId: string }[] = []
  if (orgId) owners.push({ owner: 'organisation', ownerId: orgId })
  if (req.agentId) owners.push({ owner: 'agent', ownerId: req.agentId })
  if (req.place.kind === 'project') owners.push({ owner: 'project', ownerId: req.place.projectId })
  const people = new Set<string>()
  if (req.userId) people.add(req.userId)
  if (req.place.kind === 'own') people.add(req.place.userId)
  for (const id of people) owners.push({ owner: 'person', ownerId: id })
  if (owners.length === 0) return []
  const rows = await prisma.modelList.findMany({
    where: { OR: owners },
    select: { mode: true, entries: { select: { effect: true, pattern: true } } },
  })
  return rows
}

async function conversationModel(conversationId: string | undefined): Promise<ModelViaProvider | null> {
  if (!conversationId) return null
  const row = await prisma.conversation.findUnique({ where: { id: conversationId }, select: { talkingProviderId: true, talkingModel: true } })
  return row ? pair(row.talkingProviderId, row.talkingModel) : null
}

/**
 * The billing profile a call in this place is costed to: a shared project's own, else the default profile. Empty
 * while no default profile exists yet, which setup makes.
 */
export async function billingProfileOf(place: ResolvePlace): Promise<string> {
  if (place.kind === 'project') {
    const project = await prisma.project.findUnique({ where: { id: place.projectId }, select: { billingProfileId: true } })
    if (project?.billingProfileId) return project.billingProfileId
  }
  const fallback = await prisma.billingProfile.findFirst({ where: { isDefault: true, archivedAt: null }, select: { id: true } })
  return fallback?.id ?? ''
}

export async function readSnapshot(req: ResolveRequest): Promise<Snapshot> {
  const owner = req.place.kind === 'own' ? req.place.userId : null
  const [providers, org, agent, fixed, billingProfileId] = await Promise.all([
    routeProviders(owner, req.pick?.providerId),
    orgLayers(),
    agentLayers(req.agentId),
    conversationModel(req.conversationId),
    billingProfileOf(req.place),
  ])
  return {
    providers, org: org.layers, agent: agent.layers, agentName: agent.name,
    lists: await listsFor(org.orgId, req), conversationModel: fixed, billingProfileId,
  }
}
