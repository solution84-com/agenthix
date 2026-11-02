/**
 * What a check sends: the lead's context and tools built by the code a turn uses (coordinator/context.ts
 * `contextFrom`, tools/toolAdapter.ts `leadToolDefinitions`), from the world in world.ts instead of the database.
 * Only what a turn reads from the database is supplied here: the place's name, the conversation's places, and the
 * three tools whose offer or description reads it.
 */
import { CAPABILITY_TTL_SECONDS } from '@agenthix/core'
import type { ConversationMessageView } from '../../shared/conversations/protocol'
import { resolveEffectivePermissions } from '../../agents/permissions/effectivePermissions'
import type { ConversationTool, LeadMessage, LeadToolDefinition, PromptPart, TurnCapability } from '../contract'
import { contextFrom, placeLabelOf } from '../coordinator/context'
import { clockNote, withClock } from '../coordinator/clock'
import { leadToolDefinitions } from '../tools/toolAdapter'
import { conversationTools } from '../work/registry'
import { describeStartWork } from '../work/workers/startWork'
import { personalBoundary } from '../work/boundaries'
import { ANSWER_APPROVAL, CANCEL_OPERATION } from '../work/toolCalls/leadTools'
import { CREATE_TASK, CREATE_TASK_DESCRIPTION } from '../work/tasks/createTaskTool'
import { describeWorkspaces } from '../../branches/leadWorkspaces'
import { OFFER_LIVE_PREVIEW_TOOL } from '../../livePreviews/offer'
import { AGENT_ID, AGENT_NAME, PERSON_ID, PROJECT, PROJECT_PLACE, TASK, WORKSPACES, YOUR_SPACE_PLACE, inProject, type Home } from './world'

/** One message of what was said before, then the person's message the turn answers. */
export interface Said { role: 'person' | 'agent'; text: string }

export interface CheckSetup {
  home: Home
  /** The workspace the conversation was started in, for a conversation started in one. */
  workspace?: { name: string; git: boolean }
  /** What was said before this turn, oldest first. */
  before?: readonly Said[]
  message: string
}

const CONVERSATION_ID = 'conversation-check'

function view(seq: number, said: Said): ConversationMessageView {
  return {
    id: `m${seq}`, seq, clientMessageId: null, role: said.role === 'person' ? 'PERSON' : 'AGENT',
    authorId: said.role === 'person' ? PERSON_ID : null, agentId: said.role === 'agent' ? AGENT_ID : null,
    kind: 'TEXT', body: { text: said.text }, spoken: false, interrupted: false, withdrawn: false, encouragement: false,
    operationId: null, turnId: `turn-${seq}`, queueState: null, createdAt: new Date(0).toISOString(),
  } as ConversationMessageView
}

function placeLabelFor(home: Home): string {
  if (home === 'task') return placeLabelOf({ task: { number: TASK.number, title: TASK.title, project: PROJECT } })
  return home === 'project' ? placeLabelOf({ project: PROJECT }) : placeLabelOf({})
}

export function contextOf(setup: CheckSetup, now = new Date()): { system: PromptPart[]; messages: LeadMessage[] } {
  const said = [...(setup.before ?? []), { role: 'person' as const, text: setup.message }]
  const history = said.map((s, i) => view(i + 1, s))
  const input = history[history.length - 1]!
  const context = contextFrom({
    instructions: {
      agentName: AGENT_NAME,
      agentRole: null,
      placeLabel: placeLabelFor(setup.home),
      agentInstructions: null,
      orgInstructions: null,
    },
    segments: [],
    history,
    awaiting: new Set(),
    turn: { trigger: 'MESSAGE', inputIds: [input.id] },
    memory: null,
    places: { own: inProject(setup.home) ? PROJECT_PLACE : YOUR_SPACE_PLACE, added: [], ...(setup.workspace ? { workspace: setup.workspace } : {}) },
    listening: null,
  })
  // As a turn adds the time when it knows the person's: here with no timezone.
  return { system: context.system, messages: withClock(context.messages, clockNote(now, null), context.cacheAfterMessage) }
}

/** The authority of a turn answering the person, with the built-in agent's default tool permissions. */
export function capabilityOf(home: Home): TurnCapability {
  const effective = resolveEffectivePermissions({ approval: 'deferred', allowedTools: null, allowedBashPatterns: null }, null)
  return {
    conversationId: CONVERSATION_ID,
    turnId: 'turn-check',
    agentId: AGENT_ID,
    home: home === 'task' ? 'TASK' : home === 'project' ? 'PROJECT' : 'PERSON',
    projectId: inProject(home) ? PROJECT.id : null,
    taskId: home === 'task' ? TASK.id : null,
    actingUserId: PERSON_ID,
    readerUserId: PERSON_ID,
    trigger: 'MESSAGE',
    role: 'MEMBER',
    // Shaped as mintTurnCapability's permissionsOf shapes them.
    permissions: {
      bypassed: false,
      allowedTools: effective.allowedTools,
      allowedBashPatterns: effective.allowedBashPatterns,
      neverTools: effective.allowedTools.filter(p => p.state === 'never').map(p => p.name),
    },
    expiresAt: Date.now() + CAPABILITY_TTL_SECONDS * 1000,
  }
}

/** The offers that read the database, as a new conversation in this world has them. */
function scriptedOffer(tool: ConversationTool, home: Home): ConversationTool {
  switch (tool.name) {
    // In a task's thread, work is a run of the task (run_task): start_work is not offered there, as in a turn.
    case 'start_work': {
      if (home === 'task') return { ...tool, offered: async () => false }
      const boundary = home === 'project'
        ? { key: PROJECT.key, type: 'project' as const, id: PROJECT.id, name: PROJECT.name }
        : personalBoundary(PERSON_ID)
      return { ...tool, offered: async () => true, describe: async () => describeStartWork({ admitted: [boundary] }) }
    }
    // The project's workspaces, as the real description reads them from its site (branches/leadWorkspaces.ts).
    case CREATE_TASK: {
      const places = inProject(home) ? [{ key: PROJECT.key, workspaces: WORKSPACES }] : []
      return { ...tool, describe: async () => [CREATE_TASK_DESCRIPTION, ...describeWorkspaces(places)].join('\n') }
    }
    // The project has a code workspace and live apps have an address, as offer.ts reads them.
    case OFFER_LIVE_PREVIEW_TOOL:
      return { ...tool, offered: async () => inProject(home) }
    // Nothing waits for an answer and nothing runs in a new conversation, so neither is offered.
    case ANSWER_APPROVAL:
    case CANCEL_OPERATION:
      return { ...tool, offered: async () => false, describe: async () => '' }
    default:
      return tool
  }
}

export async function toolsOf(capability: TurnCapability, home: Home): Promise<LeadToolDefinition[]> {
  return leadToolDefinitions(capability, conversationTools().map(t => scriptedOffer(t, home)))
}
