/**
 * Who a person talks to (conversational experience spec, Who a person talks to, 3): their primary agent — a
 * personal setting, Kernel when none is set or the one set is gone — and the agents a new conversation may start
 * with in a home. The choice follows today's message box: in a person's own space, and in their personal
 * project, any agent; in any other project, the agents assigned to it, and only for a Member or Admin there.
 */
import { loadVoiceFacts, voiceRefusal } from './voice/availability'
import { HttpError, prisma } from 'wasp/server'
import type { Agent } from '@prisma/client'
import { KERNEL_HANDLE } from '../agents/kernelGuards'
import { projectStanding, VIEWER_REFUSAL } from '../projects/membership'
import type {
  ConversationAgentChoicesArgs,
  ConversationAgentView,
  PrimaryAgentView,
  SetPrimaryAgentArgs,
} from '../shared/conversations/protocol'

type Ctx = { user?: { id: string } | null }
type HomeArgs = ConversationAgentChoicesArgs

const AGENT_VIEW_SELECT = { id: true, name: true, handle: true, avatarUrl: true, role: true } as const

/** How many of the person's recent agents the picker lifts above the rest. */
export const RECENT_AGENTS = 3

export function toAgentView(agent: Pick<Agent, 'id' | 'name' | 'handle' | 'avatarUrl'> & { role?: string | null }): ConversationAgentView {
  return { id: agent.id, name: agent.name, handle: agent.handle, avatarUrl: agent.avatarUrl, role: agent.role ?? null }
}

/** The starting agent first, then up to three recent ones (newest first), then the rest by name. */
export function orderAgentChoices(agents: ConversationAgentView[], startingId: string | undefined, recentIds: string[]): ConversationAgentView[] {
  const byId = new Map(agents.map(a => [a.id, a]))
  const lead = startingId ? byId.get(startingId) : undefined
  const recent = [...new Set(recentIds)]
    .filter(id => id !== lead?.id && byId.has(id))
    .slice(0, RECENT_AGENTS)
    .map(id => byId.get(id) as ConversationAgentView)
  const lifted = new Set([lead?.id, ...recent.map(a => a.id)])
  const rest = agents.filter(a => !lifted.has(a.id)).sort((a, b) => a.name.localeCompare(b.name))
  return [...(lead ? [lead] : []), ...recent, ...rest]
}

/** The agents of the person's latest conversations, newest first. */
async function recentAgentIds(userId: string): Promise<string[]> {
  const rows = await prisma.conversation.findMany({
    where: { openedById: userId, agentId: { not: null } },
    orderBy: { lastMessageAt: 'desc' },
    distinct: ['agentId'],
    take: 20,
    select: { agentId: true },
  })
  return rows.flatMap(r => (r.agentId ? [r.agentId] : []))
}

function requireUser(context: Ctx): string {
  if (!context.user) throw new HttpError(401, 'Not authenticated')
  return context.user.id
}

/** The person's primary agent, or Kernel; `isDefault` when Kernel stands in because none is set or it is gone. */
export async function resolvePrimaryAgent(userId: string): Promise<PrimaryAgentView> {
  const settings = await prisma.userSettings.findUnique({ where: { userId }, select: { primaryAgentId: true } })
  if (settings?.primaryAgentId) {
    const chosen = await prisma.agent.findUnique({ where: { id: settings.primaryAgentId }, select: AGENT_VIEW_SELECT })
    if (chosen) return { agent: toAgentView(chosen), isDefault: false }
  }
  const kernel = await prisma.agent.findUnique({ where: { handle: KERNEL_HANDLE }, select: AGENT_VIEW_SELECT })
  if (!kernel) throw new HttpError(404, 'There is no agent to talk to yet')
  return { agent: toAgentView(kernel), isDefault: true }
}

/**
 * The agents a conversation in this home may start with, the one it starts with first: the person's primary
 * agent when it is one of them, else the project's default agent, else the first; then the person's recent agents,
 * then the rest by name. Refuses a project the person
 * may not work in.
 */
export async function agentChoicesFor(args: HomeArgs, userId: string): Promise<ConversationAgentView[]> {
  if (args.home !== 'PERSON' && args.home !== 'PROJECT') throw new HttpError(400, 'A conversation starts in your own space or in a project')
  let agents: ConversationAgentView[]
  let projectDefault: string | null = null
  if (args.home === 'PERSON') {
    if (args.projectId) throw new HttpError(400, 'A conversation in your own space has no project')
    agents = await allAgents()
  } else {
    if (!args.projectId) throw new HttpError(400, 'A project conversation needs its project')
    const standing = await projectStanding(args.projectId, userId)
    if (standing === 'none') throw new HttpError(404, 'Project not found')
    if (standing === 'reads') throw new HttpError(403, `Talking to this project's agents needs the Member or Admin role in it. ${VIEWER_REFUSAL}`)
    const project = await prisma.project.findUniqueOrThrow({
      where: { id: args.projectId },
      select: { personalOwnerId: true, defaultAgentId: true, agents: { select: { agent: { select: AGENT_VIEW_SELECT } } } },
    })
    projectDefault = project.defaultAgentId
    agents = project.personalOwnerId
      ? await allAgents()
      : project.agents.map(a => toAgentView(a.agent)).sort((a, b) => a.name.localeCompare(b.name))
  }

  const primary = (await resolvePrimaryAgent(userId).catch(() => null))?.agent.id ?? null
  const startingId = [primary, projectDefault].find(id => id !== null && agents.some(a => a.id === id)) ?? agents[0]?.id
  return orderAgentChoices(agents, startingId, await recentAgentIds(userId))
}

async function allAgents(): Promise<ConversationAgentView[]> {
  const rows = await prisma.agent.findMany({ select: AGENT_VIEW_SELECT, orderBy: { name: 'asc' } })
  return rows.map(toAgentView)
}

export const getPrimaryAgent = async (_args: void, context: Ctx): Promise<PrimaryAgentView> => {
  return resolvePrimaryAgent(requireUser(context))
}

export const setPrimaryAgent = async (args: SetPrimaryAgentArgs, context: Ctx): Promise<PrimaryAgentView> => {
  const userId = requireUser(context)
  const agentId = args?.agentId ?? null
  if (agentId !== null) {
    if (typeof agentId !== 'string') throw new HttpError(400, 'An agent id is required')
    const agent = await prisma.agent.findUnique({ where: { id: agentId }, select: { id: true } })
    if (!agent) throw new HttpError(404, 'Agent not found')
  }
  await prisma.userSettings.upsert({
    where: { userId },
    update: { primaryAgentId: agentId },
    create: { userId, role: 'MEMBER', config: {}, primaryAgentId: agentId },
  })
  return resolvePrimaryAgent(userId)
}

/** The agents offered when a conversation starts here, the one it starts with first. */
/** The agents a new conversation can start with, each with why voice cannot start with it (null when it can). */
export const getConversationAgentChoices = async (args: HomeArgs, context: Ctx): Promise<ConversationAgentView[]> => {
  const userId = requireUser(context)
  const agents = await agentChoicesFor(args, userId)
  return Promise.all(agents.map(async agent => {
    const facts = await loadVoiceFacts({ agentId: agent.id, holderId: null, speakingRefusal: null, accessProblem: null })
    return { ...agent, voiceRefusal: voiceRefusal(facts, userId) }
  }))
}
