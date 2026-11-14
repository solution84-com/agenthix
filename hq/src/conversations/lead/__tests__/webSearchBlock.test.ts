/**
 * What a turn is told of web search (walkthrough findings W1 and W2): whether its background work can search, worked
 * out as a brief's run would be — its runtime, its agent's permission for Search the web, the key — and what to do.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CLAUDE_SDK_RUNTIME, NO_WEB_SEARCH_WORDS, OPENCODE_RUNTIME, WEB_SEARCH_NOT_ALLOWED_WORDS, type ToolPermission } from '@agenthix/core'
import type { RunChoice } from '../../../agents/runModel'

const resolved = vi.hoisted(() => ({
  choice: null as RunChoice | null, key: false, keyRead: 0, asked: [] as unknown[],
  agent: null as { id: string; approval: string; allowedTools: unknown; allowedBashPatterns: unknown } | null,
  tools: [] as ToolPermission[], permissionsAsked: [] as unknown[], own: { type: 'project', id: 'p1' } as { type: string; id: string } | null,
}))
vi.mock('wasp/server', () => ({ prisma: { agent: { findUnique: async () => resolved.agent } } }))
vi.mock('../../../agents/runModel', () => ({
  chooseRunModel: async (input: unknown) => { resolved.asked.push(input); return resolved.choice },
}))
vi.mock('../../../agents/overrides/agentOverrideService', () => ({
  runPermissions: async (agent: unknown, boundary: unknown) => {
    resolved.permissionsAsked.push({ agent, boundary })
    return { approval: 'deferred', allowedTools: resolved.tools, allowedBashPatterns: [] }
  },
}))
vi.mock('../../places', () => ({ ownPlace: async () => resolved.own }))
vi.mock('../../../routing/place', () => ({
  placeOfConversation: async (ref: { home: string; taskId: string | null; openedById: string }) => {
    if (ref.home === 'TASK' && !ref.taskId) throw new Error('A task conversation names no task')
    return ref.home === 'PERSON' ? { kind: 'own', userId: ref.openedById } : { kind: 'project', projectId: 'p1' }
  },
}))
vi.mock('../../../server/providerService', () => ({
  hasWebSearchKey: async () => { resolved.keyRead++; return resolved.key },
}))

const { backgroundSearchFor, canSearchInBackground, webSearchState, webSearchTurnBlock } = await import('../webSearchBlock')

const choice = (runtime: RunChoice['runtime'], problem: string | null = null): RunChoice => ({ model: 'm', runtime, resolution: null, problem })
const conversation = { id: 'c1', home: 'PROJECT' as const, projectId: 'p1', taskId: null, openedById: 'u-opener' }
const AGENT = { id: 'a1', approval: 'deferred', allowedTools: null, allowedBashPatterns: null }
const claude = { runtime: CLAUDE_SDK_RUNTIME, permission: 'always', searchKey: false } as const
const openCodeKey = { runtime: OPENCODE_RUNTIME, permission: 'always', searchKey: true } as const
const openCodeNoKey = { runtime: OPENCODE_RUNTIME, permission: 'always', searchKey: false } as const

describe("the turn's web search block (W1, W2)", () => {
  it("can search in Claude Code, and in OpenCode with a key, at Always or Ask; never at Never; not in OpenCode without a key", () => {
    expect(canSearchInBackground(claude)).toBe(true)
    expect(canSearchInBackground(openCodeKey)).toBe(true)
    expect(canSearchInBackground({ ...claude, permission: 'ask' })).toBe(true)
    expect(canSearchInBackground(openCodeNoKey)).toBe(false)
    expect(canSearchInBackground({ ...claude, permission: 'never' })).toBe(false)
    expect(canSearchInBackground({ ...openCodeKey, permission: 'never' })).toBe(false)
  })

  it('where it can, carries a search on in the background with the words kept, and never says it cannot reach the web', () => {
    for (const search of [claude, openCodeKey]) {
      const text = webSearchTurnBlock(search)
      expect(text.split('\n')[0]).toBe('[Web search, checked this turn]')
      expect(text).toContain('Work you do in the background can search the web')
      expect(text).toContain('straight away')
      expect(text).toContain("the person's request word for word in the brief")
      expect(text).toContain("Never say you can't reach the web")
      expect(text).not.toContain(NO_WEB_SEARCH_WORDS)
      expect(text).not.toContain('approve')
    }
    expect(webSearchTurnBlock(claude)).toContain('in Claude Code, which searches on its own')
    expect(webSearchTurnBlock(openCodeKey)).toContain("in OpenCode, with this organisation's search key")
  })

  it("at Ask, carries it on too and says the person will be asked to approve the search", () => {
    const text = webSearchTurnBlock({ ...claude, permission: 'ask' })
    expect(text).toContain('Work you do in the background can search the web')
    expect(text).toContain("say too that they'll be asked to approve the search")
  })

  it("at Never, says the agent's tools don't allow it in core's words, starts no work, and never blames a key", () => {
    for (const search of [{ ...claude, permission: 'never' as const }, { ...openCodeNoKey, permission: 'never' as const }]) {
      const text = webSearchTurnBlock(search)
      expect(text).toContain(`"${WEB_SEARCH_NOT_ALLOWED_WORDS}"`)
      expect(text).toContain('Search the web is set to Never in your permissions')
      expect(text).toContain('start no work for the search')
      expect(text).toContain('Never blame a search key')
      expect(text).not.toContain(NO_WEB_SEARCH_WORDS)
      expect(text).not.toContain('Work you do in the background can search the web')
    }
  })

  it("where there's no key, says why in core's words, offers what it knows, and starts no work for the search", () => {
    const text = webSearchTurnBlock(openCodeNoKey)
    expect(text).toContain(`"${NO_WEB_SEARCH_WORDS}"`)
    expect(NO_WEB_SEARCH_WORDS).toContain('I can answer from what I already know')
    expect(text).toContain('start no work for the search')
    expect(text).not.toContain('Work you do in the background can search the web')
  })

  it("reads Search the web's state off a run's tools; one its list leaves out is not granted", () => {
    expect(webSearchState([{ name: 'web_search', state: 'ask' }])).toBe('ask')
    expect(webSearchState([{ name: 'read_file', state: 'always' }])).toBe('never')
  })
})

describe('what background work from a turn would get (W1, W2)', () => {
  beforeEach(() => {
    resolved.choice = null
    resolved.key = false
    resolved.keyRead = 0
    resolved.asked = []
    resolved.agent = AGENT
    resolved.tools = [{ name: 'web_search', state: 'ask' }]
    resolved.permissionsAsked = []
    resolved.own = { type: 'project', id: 'p1' }
  })

  it("resolves the model as a brief in the conversation's own place would, for the person the turn answers", async () => {
    resolved.choice = choice(CLAUDE_SDK_RUNTIME)
    expect(await backgroundSearchFor(conversation, 'a1', 'u-acting')).toEqual({ runtime: CLAUDE_SDK_RUNTIME, permission: 'ask', searchKey: false })
    expect(resolved.asked).toEqual([{ agentId: 'a1', place: { kind: 'project', projectId: 'p1' }, userId: 'u-acting', conversationId: 'c1' }])
    // Claude Code searches on its own: the key is not looked at.
    expect(resolved.keyRead).toBe(0)
  })

  it("resolves the agent's permission as a run in the conversation's own place gets it, narrowing included", async () => {
    resolved.choice = choice(CLAUDE_SDK_RUNTIME)
    resolved.tools = [{ name: 'web_search', state: 'never' }]
    expect(await backgroundSearchFor(conversation, 'a1', 'u-acting')).toMatchObject({ permission: 'never' })
    expect(resolved.permissionsAsked).toEqual([{ agent: AGENT, boundary: { type: 'project', id: 'p1' } }])
  })

  it("reads whether a key is stored only for OpenCode; a turn with no person resolves for the conversation's opener", async () => {
    resolved.choice = choice(OPENCODE_RUNTIME)
    resolved.key = true
    resolved.own = { type: 'user', id: 'u-opener' }
    expect(await backgroundSearchFor({ ...conversation, home: 'PERSON', projectId: null }, 'a1', null)).toEqual({ runtime: OPENCODE_RUNTIME, permission: 'ask', searchKey: true })
    expect(resolved.asked[0]).toMatchObject({ place: { kind: 'own', userId: 'u-opener' }, userId: 'u-opener' })
    resolved.key = false
    expect(await backgroundSearchFor(conversation, 'a1', 'u-acting')).toEqual({ runtime: OPENCODE_RUNTIME, permission: 'ask', searchKey: false })
  })

  it('tells nothing when no model could run the work, the place cannot be read, or the agent is gone', async () => {
    resolved.choice = choice(CLAUDE_SDK_RUNTIME, 'No model is allowed here.')
    expect(await backgroundSearchFor(conversation, 'a1', 'u-acting')).toBeNull()
    resolved.choice = choice(CLAUDE_SDK_RUNTIME)
    expect(await backgroundSearchFor({ ...conversation, home: 'TASK', taskId: null }, 'a1', 'u-acting')).toBeNull()
    resolved.own = null
    expect(await backgroundSearchFor(conversation, 'a1', 'u-acting')).toBeNull()
    resolved.own = { type: 'project', id: 'p1' }
    resolved.agent = null
    expect(await backgroundSearchFor(conversation, 'a1', 'u-acting')).toBeNull()
  })
})
