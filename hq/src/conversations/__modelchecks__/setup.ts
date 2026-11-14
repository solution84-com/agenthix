/**
 * What a check sends: the lead's context and tools built by the code a turn uses (coordinator/context.ts
 * `contextFrom`, tools/toolAdapter.ts `leadToolDefinitions`), from the world in world.ts instead of the database.
 * Only what a turn reads from the database is supplied here: the place's name, the conversation's places, and the
 * three tools whose offer or description reads it.
 */
import { CAPABILITY_TTL_SECONDS, type FeatureFlag } from '@agenthix/core'
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
import { RUN_TASK, describeRunTask } from '../work/tasks/runTaskTool'
import { describeWorkerWorkspaces, describeWorkspaces } from '../../branches/leadWorkspaces'
import type { ConversationBranch } from '../lead/placesBlock'
import type { BackgroundSearch } from '../lead/webSearchBlock'
import { OFFER_LIVE_PREVIEW_TOOL } from '../../livePreviews/offer'
import { KEEP_LISTENING } from '../coordinator/keepListening'
import { memoryTurnBlock } from '../memory/turnBlock'
import type { RecalledItem } from '../../memory/contract'
import { AGENT_ID, AGENT_NAME, PERSON_ID, PROJECT, PROJECT_PLACE, TASK, WORKSPACES, YOUR_SPACE_PLACE, inProject, type Home } from './world'

/** One message of what was said before, then the person's message the turn answers. */
export interface Said { role: 'person' | 'agent'; text: string }

/**
 * The person's memories, and the tier the probe put them in for the turn: `included` in full, `hinted` by title and
 * key, or `none`: held, but below the bars. `recall` answers from the same items.
 */
export interface CheckMemory { items: readonly RecalledItem[]; shown: 'included' | 'hinted' | 'none' }

export interface CheckSetup {
  home: Home
  /** The conversation's own open branches, for a conversation whose work already changed a code workspace. */
  branches?: readonly ConversationBranch[]
  /** What was said before this turn, oldest first. */
  before?: readonly Said[]
  message: string
  /** The flagged features on, as shipped when none: a feature's own checks name it (adr-0172). */
  features?: readonly FeatureFlag[]
  /** What the probe found before the turn; nothing when none. */
  memory?: CheckMemory
  /** What the turn is told of web search in the background; told nothing when none, as a turn whose model can't run. */
  webSearch?: BackgroundSearch
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

/** What was said, as the conversation's history holds it: the person's message last. */
export function historyOf(setup: CheckSetup): ConversationMessageView[] {
  const said = [...(setup.before ?? []), { role: 'person' as const, text: setup.message }]
  return said.map((s, i) => view(i + 1, s))
}

/** The block the probe's hook writes for a turn that has tools (turnMemory.ts), from the check's memory. */
function memoryBlockOf(memory: CheckMemory | undefined): string | null {
  if (!memory || memory.shown === 'none') return null
  const included = memory.shown === 'included'
  return memoryTurnBlock({
    certain: included ? [...memory.items] : [],
    probable: included ? [] : memory.items.map(i => ({ key: i.key, title: i.title })),
  }, true)
}

export function contextOf(setup: CheckSetup, now = new Date()): { system: PromptPart[]; messages: LeadMessage[] } {
  const history = historyOf(setup)
  const input = history[history.length - 1]!
  const context = contextFrom({
    instructions: {
      agentName: AGENT_NAME,
      agentRole: null,
      placeLabel: placeLabelFor(setup.home),
      agentInstructions: null,
      orgInstructions: null,
      featuresOn: setup.features ?? [],
    },
    segments: [],
    history,
    awaiting: new Set(),
    turn: { trigger: 'MESSAGE', inputIds: [input.id] },
    memory: memoryBlockOf(setup.memory),
    places: { own: inProject(setup.home) ? PROJECT_PLACE : YOUR_SPACE_PLACE, added: [], ...(setup.branches ? { branches: [...setup.branches] } : {}) },
    ...(setup.webSearch ? { webSearch: setup.webSearch } : {}),
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
function scriptedOffer(tool: ConversationTool, home: Home, features: readonly FeatureFlag[]): ConversationTool {
  const livePreview = features.includes('livePreview')
  switch (tool.name) {
    // In a task's thread, work is a run of the task (run_task): start_work is not offered there, as in a turn.
    case 'start_work': {
      if (home === 'task') return { ...tool, offered: async () => false }
      const boundary = home === 'project'
        ? { key: PROJECT.key, type: 'project' as const, id: PROJECT.id, name: PROJECT.name }
        : personalBoundary(PERSON_ID)
      // The project's workspaces, as the real description reads them from its site.
      const workspaces = describeWorkerWorkspaces(home === 'project' ? [{ key: PROJECT.key, workspaces: WORKSPACES }] : [])
      return { ...tool, offered: async () => true, describe: async () => describeStartWork({ admitted: [boundary], workspaces }) }
    }
    // The project's workspaces, as the real description reads them from its site (branches/leadWorkspaces.ts).
    case CREATE_TASK: {
      const places = inProject(home) ? [{ key: PROJECT.key, workspaces: WORKSPACES }] : []
      return { ...tool, describe: async () => [CREATE_TASK_DESCRIPTION, ...describeWorkspaces(places)].join('\n') }
    }
    // The project has a code workspace and live apps have an address, as offer.ts reads them, while the flag is on.
    case OFFER_LIVE_PREVIEW_TOOL:
      return { ...tool, offered: async () => livePreview && inProject(home) }
    // Its description names the live preview only while the flag is on.
    case RUN_TASK:
      return { ...tool, describe: async capability => describeRunTask(capability, livePreview) }
    // Offered while the voice turn block's flag is on, as keepListening.ts reads it.
    case KEEP_LISTENING:
      return { ...tool, offered: async capability => capability.trigger !== 'REPORT' && features.includes('voiceBridge') }
    // Nothing waits for an answer and nothing runs in a new conversation, so neither is offered.
    case ANSWER_APPROVAL:
    case CANCEL_OPERATION:
      return { ...tool, offered: async () => false, describe: async () => '' }
    default:
      return tool
  }
}

export async function toolsOf(capability: TurnCapability, home: Home, features: readonly FeatureFlag[] = []): Promise<LeadToolDefinition[]> {
  return leadToolDefinitions(capability, conversationTools().map(t => scriptedOffer(t, home, features)))
}
