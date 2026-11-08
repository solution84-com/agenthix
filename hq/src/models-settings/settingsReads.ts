/**
 * What the Models screens read (models from one place, part 4): the organisation's defaults and list, an agent's own
 * choices and list, a project's or a person's list, and the models a task's or a routine's picker offers. Read by
 * whoever may change the thing; nothing here returns a key.
 */
import { HttpError, prisma } from 'wasp/server'
import type { ModelChoices, ResolveRequest } from '@agenthix/core'
import { isOrgAdmin, isProjectVisibleTo } from '../projects/membership'
import { requireMayEditList, listView, orgId, parseRef, reachableByOrg } from './modelLists'
import { offeredFor } from './offered'
import { allowedLine } from './projectModels'
import { placeOfProject } from '../routing/place'
import { orgLayers, readSnapshot, routeProviders } from '../routing/snapshot'
import { viewChoice, voiceOptions } from './choices'
import type { AgentModelsView, ListView, ModelsSettingsView, ReachableModel } from './types'
import { mayPickFor } from './pickerAccess'

type Ctx = { user?: { id: string } | null }

export async function requireOrgAdminUser(context: Ctx): Promise<string> {
  if (!context.user) throw new HttpError(401)
  if (!(await isOrgAdmin(context.user.id))) throw new HttpError(403, 'Only an organisation admin sets what models are used.')
  return context.user.id
}

const orgName = async () => (await prisma.org.findFirst({ select: { name: true } }))?.name ?? 'the organisation'

async function pickerOf(req: ResolveRequest, current: string | null): Promise<ModelChoices> {
  const { models } = await offeredFor(req)
  return { current, recent: [], models }
}

export const getModelsSettings = async (_args: void, context: Ctx): Promise<ModelsSettingsView> => {
  await requireOrgAdminUser(context)
  const req: ResolveRequest = { purpose: 'conversation', place: { kind: 'organisation' } }
  const [{ layers }, snap, reachable, name, id] = await Promise.all([orgLayers(), readSnapshot(req), reachableByOrg(), orgName(), orgId()])
  const providers = await routeProviders(null)
  return {
    orgName: name,
    conversation: viewChoice(layers.conversation, snap),
    stt: viewChoice(layers.stt, snap, true), tts: viewChoice(layers.tts, snap, true),
    choices: await pickerOf(req, null),
    stt_options: voiceOptions(providers, 'stt'), tts_options: voiceOptions(providers, 'tts'),
    list: await listView({ owner: 'organisation', ownerId: id }, reachable),
    reachable,
  }
}

export const getAgentModels = async (args: { agentId: string }, context: Ctx): Promise<AgentModelsView> => {
  await requireOrgAdminUser(context)
  const agent = await prisma.agent.findUnique({ where: { id: args?.agentId }, select: { id: true } })
  if (!agent) throw new HttpError(404, 'That agent is gone')
  const req: ResolveRequest = { purpose: 'conversation', place: { kind: 'organisation' }, agentId: agent.id }
  const [snap, reachable, name] = await Promise.all([readSnapshot(req), reachableByOrg(), orgName()])
  const providers = await routeProviders(null)
  return {
    orgName: name,
    conversation: viewChoice(snap.agent?.conversation ?? null, snap),
    stt: viewChoice(snap.agent?.stt ?? null, snap, true), tts: viewChoice(snap.agent?.tts ?? null, snap, true),
    orgConversation: viewChoice(snap.org.conversation, snap),
    orgStt: viewChoice(snap.org.stt, snap, true), orgTts: viewChoice(snap.org.tts, snap, true),
    choices: await pickerOf(req, null),
    stt_options: voiceOptions(providers, 'stt'), tts_options: voiceOptions(providers, 'tts'),
    list: await listView({ owner: 'agent', ownerId: agent.id }, reachable),
    reachable,
  }
}

/** A project's or a person's list, for the people who may change it. */
export const getModelList = async (args: unknown, context: Ctx): Promise<{ list: ListView; reachable: ReachableModel[]; orgName: string }> => {
  if (!context.user) throw new HttpError(401)
  const ref = parseRef(args)
  await requireMayEditList(ref, context.user.id)
  const reachable = await reachableByOrg()
  return { list: await listView(ref, reachable), reachable, orgName: await orgName() }
}

/** What is allowed in a project, in a line, for anyone who works in it or reads it (the list itself is its admins'). */
export const getProjectModelsLine = async (args: { projectId: string }, context: Ctx): Promise<string> => {
  if (!context.user) throw new HttpError(401)
  if (!args?.projectId) throw new HttpError(400, 'Which project?')
  if (!(await isProjectVisibleTo(args.projectId, context.user.id))) throw new HttpError(404, 'Project not found')
  const reachable = await reachableByOrg()
  const view = await listView({ owner: 'project', ownerId: args.projectId }, reachable)
  return allowedLine(view, reachable, await orgName())
}

export type AgentModelLines = { orgDefault: string; lines: Record<string, string> }

/** What each agent's models are shown as in the lists of agents: its own default model; the rest follow the organisation's. */
export const getAgentModelLines = async (_args: void, context: Ctx): Promise<AgentModelLines> => {
  if (!context.user) throw new HttpError(401)
  const org = await orgName()
  const snap = await readSnapshot({ purpose: 'conversation', place: { kind: 'organisation' } })
  const rows = await prisma.agentModelChoices.findMany({ select: { agentId: true, conversationProviderId: true, conversationModel: true } })
  const lines: Record<string, string> = {}
  for (const r of rows) {
    const view = r.conversationProviderId && r.conversationModel
      ? viewChoice({ providerId: r.conversationProviderId, model: r.conversationModel }, snap) : null
    if (view) lines[r.agentId] = view.text
  }
  return { orgDefault: `${org}'s default`, lines }
}

/**
 * The models a task's or a routine's picker offers: those the agent may use in that project, within every list that
 * applies there, with a provider that is not working greyed out.
 */
export const getModelPickerChoices = async (args: { projectId: string; agentId?: string | null }, context: Ctx): Promise<ModelChoices> => {
  if (!context.user) throw new HttpError(401)
  await mayPickFor(args?.projectId, context.user.id)
  const place = await placeOfProject(args.projectId)
  return pickerOf({ purpose: 'worker', place, userId: context.user.id, ...(args.agentId ? { agentId: args.agentId } : {}) }, null)
}
