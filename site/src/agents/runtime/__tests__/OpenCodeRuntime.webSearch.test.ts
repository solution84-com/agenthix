/**
 * Web search on an OpenCode turn (what agents can do, spec decision 5 and section 4): a turn of an organisation with
 * no search key is not shown `web_search` — its session rules deny it, brought up to date at every turn — and its
 * instructions say web search isn't set up. A turn with the key is shown the tool and told nothing.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NO_WEB_SEARCH_INSTRUCTIONS } from '@agenthix/core'

vi.mock('#db', () => ({ prisma: {} }))
vi.mock('../../../server/siteConfig', () => ({ getAgentFacingSiteUrl: () => 'http://site' }))
vi.mock('../landlockCheck', () => ({ requireLandlock: vi.fn() }))

import { OpenCodeRuntime } from '../OpenCodeRuntime'
import { json, type Call } from '../opencode/__tests__/fakeRelay'
import { sessionPermissionRules } from '../opencode/openCodeConnection'
import { resetOpenCodeTurnsForTests } from '../opencode/openCodeTurns'
import { resetGateRunsForTests } from '../toolGateRuns'
import { CONN, collect, context, memoryStore, noSkills, replyAndIdle, scripted } from './openCodeRuntimeFixtures'

const WEB_SEARCH = `${CONN}_web_search`
const WITHOUT_KEY = `You are Ada.\n\n${NO_WEB_SEARCH_INSTRUCTIONS}`

type Rule = { permission: string; pattern: string; action: string }
const created = (calls: Call[]) => (calls.find(c => c.path.startsWith('/session?'))!.body as { permission: Rule[] }).permission
const systems = (calls: Call[]) => calls.filter(c => c.path.includes('/prompt_async')).map(c => (c.body as { system?: string }).system)

beforeEach(() => {
  resetOpenCodeTurnsForTests()
  resetGateRunsForTests()
})

describe('an OpenCode turn and the organisation\'s search key', () => {
  it('without the key, denies web_search in the session\'s rules and says in the instructions that web search isn\'t set up', async () => {
    const { servers, relays } = scripted(replyAndIdle)
    await collect(new OpenCodeRuntime({ servers, store: memoryStore(), stageSkills: noSkills }).run(context({ webSearchKey: undefined })))
    expect(created(relays[0].calls)).toEqual(sessionPermissionRules(CONN, [WEB_SEARCH]))
    expect(systems(relays[0].calls)).toEqual([WITHOUT_KEY])
  })

  it('with the key, leaves web_search listed and adds nothing to the instructions', async () => {
    const { servers, relays } = scripted(replyAndIdle)
    await collect(new OpenCodeRuntime({ servers, store: memoryStore(), stageSkills: noSkills }).run(context()))
    expect(created(relays[0].calls)).toEqual(sessionPermissionRules(CONN))
    expect(systems(relays[0].calls)).toEqual(['You are Ada.'])
  })

  it('shows web_search at the next turn once a key is added, and hides it at the next turn once the key is removed', async () => {
    let held: Rule[] = []
    const { servers, relays } = scripted(relay => {
      relay.emit({ type: 'session.idle', properties: { sessionID: 'ses_new' } })
    }, c => {
      if (c.path.startsWith('/session?')) { held = (c.body as { permission: Rule[] }).permission; return json(200, { id: 'ses_new' }) }
      if (!c.path.startsWith('/session/ses_new?')) return undefined
      if (c.method === 'GET') return json(200, { id: 'ses_new', permission: held })
      if (c.method === 'PATCH') { held = [...held, ...(c.body as { permission: Rule[] }).permission]; return json(200, { id: 'ses_new' }) }
      return undefined
    })
    const runtime = new OpenCodeRuntime({ servers, store: memoryStore(), stageSkills: noSkills })
    // OpenCode applies the last rule that matches a tool, so whether web_search is shown is the last rule naming it.
    const shown = () => held.filter(r => r.permission === WEB_SEARCH || r.permission === `${CONN}_*`).at(-1)?.action === 'allow'

    await collect(runtime.run(context({ webSearchKey: undefined })))
    expect(shown()).toBe(false)
    await collect(runtime.run(context({ runId: 'run-2' })))
    expect(held.slice(-sessionPermissionRules(CONN).length)).toEqual(sessionPermissionRules(CONN))
    expect(shown()).toBe(true)
    await collect(runtime.run(context({ runId: 'run-3', webSearchKey: undefined })))
    expect(held.slice(-sessionPermissionRules(CONN, [WEB_SEARCH]).length)).toEqual(sessionPermissionRules(CONN, [WEB_SEARCH]))
    expect(shown()).toBe(false)

    expect(relays[0].calls.filter(c => c.method === 'PATCH')).toHaveLength(2)
    expect(systems(relays[0].calls)).toEqual([WITHOUT_KEY, 'You are Ada.', WITHOUT_KEY])
  })
})
