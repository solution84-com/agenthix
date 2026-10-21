/**
 * Who pays for a conversation's turns, by its home (model access and policy spec, adr-0105), and whose model
 * policy chooses its talking model. API keys only: a subscription is a person's harness sign-in, used by work on
 * a site, and never pays for a conversation.
 *
 *   PERSON  → the person's key, then the organisation's
 *   PROJECT → the project's key, then the person's, then the organisation's
 *   TASK    → the project's key, then the organisation's — never a person's: the thread is the team's
 *
 * The person is the one who opened the conversation: a personal or project conversation is theirs alone. A
 * personal project holds no key of its own (model-access refuses one), so it falls to its person's, in a PROJECT
 * home. Its policy is its person's own, as its runs' overrides are.
 */
import { HttpError, prisma } from 'wasp/server'
import type { AccessOwner, ConversationHomeRef, ModelProvider, ResolvedAccess } from '../contract'
import { readApiKey } from '../../model-access/apiKeys'
import { PROVIDER_LABELS } from '../../shared/modelProviders'
import { DEFAULT_MODEL } from '../../agents/models'

export type Payer = { type: AccessOwner; id: string }

export interface HomeAccess {
  home: ConversationHomeRef['home']
  payers: Payer[]
  policyBoundary: { type: 'user' | 'project'; id: string }
  agent: { defaultModel: string; runtime: string }
}

const ORG: Payer = { type: 'org', id: 'org' }
const NO_AGENT = { defaultModel: DEFAULT_MODEL, runtime: 'claude-sdk' }

async function agentOf(agentId: string | null): Promise<HomeAccess['agent']> {
  if (!agentId) return NO_AGENT
  const agent = await prisma.agent.findUnique({ where: { id: agentId }, select: { defaultModel: true, runtime: true } })
  return agent ?? NO_AGENT
}

async function projectOf(projectId: string): Promise<{ personalOwnerId: string | null }> {
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { personalOwnerId: true } })
  if (!project) throw new HttpError(404, 'Project not found')
  return project
}

export async function homeAccess(conversation: ConversationHomeRef): Promise<HomeAccess> {
  const person: Payer = { type: 'user', id: conversation.openedById }
  if (conversation.home === 'PERSON') {
    return {
      home: 'PERSON',
      payers: [person, ORG],
      policyBoundary: { type: 'user', id: conversation.openedById },
      agent: await agentOf(conversation.agentId),
    }
  }
  if (conversation.home === 'PROJECT') {
    if (!conversation.projectId) throw new HttpError(500, 'A project conversation names no project')
    const { personalOwnerId } = await projectOf(conversation.projectId)
    return {
      home: 'PROJECT',
      payers: [{ type: 'project', id: conversation.projectId }, person, ORG],
      policyBoundary: personalOwnerId ? { type: 'user', id: personalOwnerId } : { type: 'project', id: conversation.projectId },
      agent: await agentOf(conversation.agentId),
    }
  }
  if (!conversation.taskId) throw new HttpError(500, 'A task conversation names no task')
  const task = await prisma.task.findUnique({
    where: { id: conversation.taskId },
    select: { projectId: true, assignedAgentId: true, project: { select: { personalOwnerId: true } } },
  })
  if (!task) throw new HttpError(404, 'Task not found')
  const personalOwnerId = task.project.personalOwnerId
  return {
    home: 'TASK',
    payers: [{ type: 'project', id: task.projectId }, ORG],
    policyBoundary: personalOwnerId ? { type: 'user', id: personalOwnerId } : { type: 'project', id: task.projectId },
    agent: await agentOf(task.assignedAgentId),
  }
}

/** An owner's key for a provider that the provider refused: never used by the conversation again. */
export type RefusedAccess = { owner: AccessOwner; provider: ModelProvider }

export function isRefused(refused: readonly RefusedAccess[], owner: AccessOwner, provider: ModelProvider): boolean {
  return refused.some(r => r.owner === owner && r.provider === provider)
}

/** The first payer, in order, holding a usable key for the provider and not refused; null when none does. */
export async function payingAccess(
  payers: readonly Payer[],
  provider: ModelProvider,
  model: string,
  refused: readonly RefusedAccess[] = [],
): Promise<ResolvedAccess | null> {
  for (const payer of payers) {
    if (isRefused(refused, payer.type, provider)) continue
    const access = await payerAccess(payer, provider, model)
    if (access) return access
  }
  return null
}

/** One payer's usable key for the provider, or null. */
export async function payerAccess(payer: Payer, provider: ModelProvider, model: string): Promise<ResolvedAccess | null> {
  const key = await readApiKey(payer.type, payer.id, provider)
  return key ? { ...key, model, owner: payer.type, kind: 'API_KEY' } : null
}

const YOUR_LOGINS = 'Settings › Your model logins'
const ORG_ACCESS = 'Organisation › Settings › Model access'

/** What is missing for a provider in this home, and where to add it. */
export function missingAccess(home: HomeAccess['home'], provider: ModelProvider): string {
  const label = PROVIDER_LABELS[provider]
  const what = provider === 'openai_compatible' ? 'an OpenAI-compatible endpoint' : `${/^[AEIOU]/.test(label) ? 'an' : 'a'} ${label} API key`
  if (home === 'TASK') {
    return `Task threads need a key on the project: a project admin adds ${what} on the project's settings, or an ` +
      `admin adds the organisation's under ${ORG_ACCESS}.`
  }
  const project = home === 'PROJECT' ? `ask a project admin to add ${what} on the project's settings, ` : ''
  return `A conversation needs ${what}. Add your own under ${YOUR_LOGINS}, ${project}or ask an admin to add the ` +
    `organisation's under ${ORG_ACCESS}. A Claude subscription is used for work, not for conversations.`
}

export function payerLabel(owner: AccessOwner): string {
  return owner === 'user' ? 'your own' : owner === 'project' ? "the project's" : "the organisation's"
}
