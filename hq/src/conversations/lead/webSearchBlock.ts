/**
 * What a turn is told of web search (walkthrough findings W1 and W2): a reply has none, but the agent's background
 * work runs on a site, where Claude Code searches on its own and OpenCode searches with the organisation's search key,
 * each only as far as the agent's tools allow Search the web. Worked out as a brief in the conversation's own place
 * would be (`work/workers/workModel.ts`, `agents/runContext.ts`): the runtime its model resolves to, the state its
 * permissions give `web_search` there (`runPermissions`, as the run's own are resolved), and, for OpenCode, whether a
 * key is stored. Re-checked every turn, after the cached part of the prompt, since any of them can change between
 * turns. Only whether a key is stored is read here.
 */
import {
  NO_WEB_SEARCH_WORDS, OPENCODE_RUNTIME, WEB_SEARCH_NOT_ALLOWED_WORDS, type AgentRuntimeName, type ToolPermissionState,
} from '@agenthix/core'
import { prisma } from 'wasp/server'
import type { ConversationHomeRef } from '../contract'
import { chooseRunModel } from '../../agents/runModel'
import { runPermissions } from '../../agents/overrides/agentOverrideService'
import { RUNTIME_TOOLS } from '../../shared/runtimeTools'
import { placeOfConversation } from '../../routing/place'
import { hasWebSearchKey } from '../../server/providerService'
import { ownPlace } from '../places'

/**
 * The runtime background work would run on, the state its agent's permissions give Search the web there, and whether
 * the organisation has a search key stored.
 */
export interface BackgroundSearch { runtime: AgentRuntimeName; permission: ToolPermissionState; searchKey: boolean }

export function canSearchInBackground({ runtime, permission, searchKey }: BackgroundSearch): boolean {
  return permission !== 'never' && (runtime !== OPENCODE_RUNTIME || searchKey)
}

/** What a run's permissions give a tool: a tool its list leaves out is not granted, as `mergeTools` reads it. */
export function webSearchState(tools: { name: string; state: ToolPermissionState }[]): ToolPermissionState {
  return tools.find(t => t.name === RUNTIME_TOOLS.WEB.WEB_SEARCH)?.state ?? 'never'
}

const HEADING = '[Web search, checked this turn]'

export function webSearchTurnBlock(search: BackgroundSearch): string {
  // The agent's tools come first: while they withhold the search, a key would not help.
  if (search.permission === 'never') {
    return [
      HEADING,
      "Neither this reply nor work you do in the background can search the web: your tools don't allow it here, as",
      'Search the web is set to Never in your permissions. When the person asks you to search the web or to find',
      'something current, start no work for the search. Say why, in these words or close to them:',
      `"${WEB_SEARCH_NOT_ALLOWED_WORDS}"`,
      'Then answer from what you know if they want it. Never blame a search key, and never pretend to search or make up results.',
    ].join('\n')
  }
  if (!canSearchInBackground(search)) {
    return [
      HEADING,
      'Neither this reply nor work you do in the background can search the web: your background work runs in OpenCode,',
      "which searches with a search key, and this organisation hasn't added one. When the person asks you to search the",
      'web or to find something current, start no work for the search. Say why, in these words or close to them:',
      `"${NO_WEB_SEARCH_WORDS}"`,
      'Then answer from what you know if they want it. Never pretend to search or make up results.',
    ].join('\n')
  }
  const how = search.runtime === OPENCODE_RUNTIME ? "in OpenCode, with this organisation's search key" : 'in Claude Code, which searches on its own'
  return [
    HEADING,
    `Work you do in the background can search the web: it runs ${how}. This reply cannot search. When the person asks`,
    'you to search the web or to find something current, carry it on in the background straight away, in this step:',
    "start work for it (in a task's thread, run the task), with the person's request word for word in the brief, and",
    search.permission === 'ask'
      ? "say in one line that you're looking it up and that they'll be asked to approve the search, since your tools set Search the web to Ask."
      : "say in one line that you're looking it up.",
    "Never say you can't reach the web or have no browsing tool, and never send the person to another agent or ask",
    'them to search themselves.',
  ].join('\n')
}

/**
 * What background work started from this turn in the conversation's own place would get, for `actingUserId`; null
 * when no model could run it (the work would fail for that reason, not for search) or the place can't be read.
 */
export async function backgroundSearchFor(
  conversation: Pick<ConversationHomeRef, 'id' | 'home' | 'projectId' | 'taskId' | 'openedById'>,
  agentId: string,
  actingUserId: string | null,
): Promise<BackgroundSearch | null> {
  try {
    const [choice, permission] = await Promise.all([
      chooseRunModel({
        agentId,
        place: await placeOfConversation(conversation),
        userId: actingUserId ?? conversation.openedById,
        conversationId: conversation.id,
      }),
      webSearchPermission(conversation, agentId),
    ])
    if (choice.problem || !permission) return null
    return { runtime: choice.runtime, permission, searchKey: choice.runtime === OPENCODE_RUNTIME ? await hasWebSearchKey() : false }
  } catch {
    return null
  }
}

/**
 * The state a run in the conversation's own place gives Search the web: the agent's own permissions with that place's
 * narrowing on top, as the run's are resolved (`runPermissions`, also behind start_work's admission). Null when the
 * agent or the place is gone.
 */
async function webSearchPermission(
  conversation: Pick<ConversationHomeRef, 'id' | 'home' | 'projectId' | 'openedById'>,
  agentId: string,
): Promise<ToolPermissionState | null> {
  const [agent, place] = await Promise.all([
    prisma.agent.findUnique({ where: { id: agentId }, select: { id: true, approval: true, allowedTools: true, allowedBashPatterns: true } }),
    ownPlace(conversation),
  ])
  if (!agent || !place) return null
  return webSearchState((await runPermissions(agent, place)).allowedTools)
}
