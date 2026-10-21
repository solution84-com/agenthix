/**
 * A reply that runs long (walkthrough findings 25, 28 and 30): after 4 steps that looked something up — never by
 * time — hq starts the rest in the background itself, with a brief it writes and no model call, then ends the
 * reply with a fixed line in the agent's voice. Where it cannot, the next call is words only.
 */
import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import type { LeadToolDefinition, ToolCallOutcome, TurnCapability } from '../../contract'
import { runTurn } from '../turn'
import { MOVED_TO_BACKGROUND, canStartWork, stepMode } from '../moveToBackground'
import { claimed, harness, scriptedModel, usage, type Step } from './turnHarness'

const finish = { type: 'finish' as const, reason: 'tool-calls' as const, usage: usage(1) }
const ask = (...calls: { id: string; name: string; input?: unknown }[]): Step =>
  [...calls.map(c => ({ type: 'tool-call' as const, call: { input: {}, ...c } })), finish]
const say = (text: string): Step => [{ type: 'text', text }, { ...finish, reason: 'stop' as const }]
const lookup = (n: number): Step => ask({ id: `c${n}`, name: 'list_projects', input: { n } })
const fourLookups = (): Step[] => [lookup(1), lookup(2), lookup(3), lookup(4)]
const startWork: LeadToolDefinition = { name: 'start_work', description: 'Start work', input: z.object({}) }

/** The capability of an agent that is not bypassed and lists no tools: start_work reads as Ask in it. */
const notBypassed = (over: Partial<TurnCapability> = {}) => async ({ turnId }: { turnId: string }): Promise<TurnCapability> => ({
  conversationId: 'conv-1', turnId, agentId: 'agent-1', home: 'PERSON', projectId: null, taskId: null, actingUserId: 'u1',
  role: 'MEMBER', permissions: { bypassed: false, allowedTools: [], allowedBashPatterns: [], neverTools: [] },
  expiresAt: Date.now() + 60_000, ...over,
})

function longHarness(steps: Step[], opts: { offered?: LeadToolDefinition[]; startWork?: ToolCallOutcome } = {}) {
  const model = scriptedModel(steps)
  const h = harness(model, {
    list_projects: { status: 'done', operationId: 'o', result: { projects: [{ key: 'WAL', name: 'Walkthrough' }] } },
    start_work: opts.startWork ?? { status: 'accepted', operationId: 'op-w' },
  }, { 'op-w': { title: 'Find the stale tasks in WAL', state: 'QUEUED', outstanding: 1 } })
  h.deps.maxSteps = 8
  h.deps.mint = notBypassed()
  h.deps.tools = { ...h.deps.tools, toolsFor: async () => opts.offered ?? [startWork] }
  return { model, h }
}

/** What hq passed start_work when it moved the reply. */
function moveCall(h: ReturnType<typeof harness>) {
  const call = h.toolCall.mock.calls.map(c => c[1] as { id: string; name: string; input: { boundary: string; title: string; brief: string } })
    .find(c => c.name === 'start_work')
  return call!
}

describe('when a reply moves to the background @SC-967', () => {
  const at = (o: Partial<Parameters<typeof stepMode>[0]>) => stepMode({ step: 1, maxSteps: 8, lookups: 1, moveAfter: 4, canMove: true, ...o })

  it('counts steps only: at 4 lookups it moves, or ends in words where it cannot', () => {
    expect(at({})).toBe('free')
    expect(at({ step: 4, lookups: 4 })).toBe('move')
    expect(at({ step: 4, lookups: 4, canMove: false })).toBe('words')
  })

  it('whatever happens, the last call the cap allows is words only', () => {
    expect(at({ step: 7, lookups: 0 })).toBe('words')
  })

  it('can start work wherever start_work is offered, whatever the turn lists', () => {
    expect(canStartWork([startWork])).toBe(true)
    expect(canStartWork([])).toBe(false)
  })
})

describe("hq's own move @SC-967", () => {
  it('starts the work itself after 4 lookups, with no further model call, and ends with the fixed reply', async () => {
    const { model, h } = longHarness(fourLookups())

    const outcome = await runTurn(h.deps, h.run().running)

    expect(model.requests).toHaveLength(4)
    expect(model.requests.every(r => r.toolChoice === undefined)).toBe(true)
    expect(moveCall(h).input).toMatchObject({ boundary: 'personal', title: 'Find the stale tasks in WAL' })
    expect(outcome).toMatchObject({ state: 'COMPLETED', text: MOVED_TO_BACKGROUND })
    expect(h.stored.map(m => m.kind)).toEqual(['OPERATION_STARTED', 'TEXT'])
    expect(h.stored[0]!.operationId).toBe('op-w')
    expect(h.operations).toEqual(['op-w:QUEUED'])
    const body = h.stored[1]!.body as { text: string; thinking: { steps: { label: string }[] } }
    expect(body.text).toBe(MOVED_TO_BACKGROUND)
    expect(body.thinking.steps).toHaveLength(5)
    expect(body.thinking.steps.at(-1)!.label).toBe('Started "Find the stale tasks in WAL"')
  })

  it("briefs the work with the person's words and what the reply found, in the conversation's own place", async () => {
    const { h } = longHarness(fourLookups())
    await runTurn(h.deps, h.run().running)

    const { brief } = moveCall(h).input
    expect(brief).toContain('Find the stale tasks in WAL')
    expect(brief).toContain("Work only in the person's own space")
    expect(brief).toContain('list_projects {"n":4} → {"projects":[{"key":"WAL","name":"Walkthrough"}]}')
    expect(h.deps.background!.asked).toHaveBeenCalledWith(['m1'])
  })

  it("starts it in a project conversation's project, by its key", async () => {
    const { h } = longHarness(fourLookups())
    h.deps.mint = notBypassed({ home: 'PROJECT', projectId: 'p-wal' })
    await runTurn(h.deps, h.run(claimed({ home: 'PROJECT', projectId: 'p-wal' })).running)

    expect(h.deps.background!.project).toHaveBeenCalledWith('p-wal')
    expect(moveCall(h).input.boundary).toBe('WAL')
    expect(moveCall(h).input.brief).toContain('Work only in the Walkthrough project')
  })

  it('names work the reply already started, so the background leaves it alone', async () => {
    const { h } = longHarness([
      lookup(1), ask({ id: 's', name: 'run_task', input: { taskId: 'WAL-2' } }, { id: 'c2', name: 'list_projects', input: { n: 2 } }), lookup(3), lookup(4),
    ])
    h.toolCall.mockImplementation(async (_c, call) => {
      if (call.name === 'run_task') return { status: 'accepted', operationId: 'op-r' }
      if (call.name === 'start_work') return { status: 'accepted', operationId: 'op-w' }
      return { status: 'done', operationId: 'o', result: {} }
    })
    await runTurn(h.deps, h.run().running)

    const { brief } = moveCall(h).input
    expect(brief).toMatch(/already started or changed[^]*run_task \{"taskId":"WAL-2"\} → started/)
  })

  it('keeps what the reply already said, and puts the fixed reply after it', async () => {
    const { h } = longHarness([
      [{ type: 'text', text: 'Let me look.' }, { type: 'tool-call', call: { id: 'c1', name: 'list_projects', input: {} } }, finish],
      lookup(2), lookup(3), lookup(4),
    ])
    const outcome = await runTurn(h.deps, h.run().running)
    expect(outcome.text).toBe(`Let me look.\n\n${MOVED_TO_BACKGROUND}`)
  })

  it('never moves by time: a slow reply under 4 lookups carries on', async () => {
    const { model, h } = longHarness([lookup(1), say('Here it is.')])
    h.toolCall.mockImplementation(async () => { h.advance(60_000); return { status: 'done', operationId: 'o', result: {} } })
    await runTurn(h.deps, h.run().running)
    expect(model.requests).toHaveLength(2)
    expect(model.requests[1]!.toolChoice).toBeUndefined()
    expect(h.stored.at(-1)!.body).toMatchObject({ text: 'Here it is.' })
  })
})

describe('where hq cannot start the work @SC-967', () => {
  const wordsOnly = (h: ReturnType<typeof scriptedModel>) => {
    expect(h.requests).toHaveLength(5)
    expect(h.requests[4]!.toolChoice).toBe('none')
    expect(h.requests[4]!.messages.at(-1)).toMatchObject({ role: 'user', content: expect.stringContaining('words only') })
  }

  it('ends in words when start_work is not offered', async () => {
    const { model, h } = longHarness([...fourLookups(), say('Here is what I found so far.')], { offered: [] })
    await runTurn(h.deps, h.run().running)
    wordsOnly(model)
    expect(h.toolCall.mock.calls.some(c => (c[1] as { name: string }).name === 'start_work')).toBe(false)
    expect(h.stored.at(-1)!.body).toMatchObject({ text: 'Here is what I found so far.' })
  })

  it('ends in words when starting the work is refused', async () => {
    const { model, h } = longHarness([...fourLookups(), say('So far: nothing.')], { startWork: { status: 'refused', reason: "you can only read Walkthrough, not start work there" } })
    await runTurn(h.deps, h.run().running)
    wordsOnly(model)
    expect(h.stored.map(m => m.kind)).toEqual(['TEXT'])
  })

  it("ends in words in a task's thread, which has no place to move to", async () => {
    const { model, h } = longHarness([...fourLookups(), say('So far.')])
    h.deps.mint = notBypassed({ home: 'TASK', projectId: 'p-wal', taskId: 't1' })
    await runTurn(h.deps, h.run(claimed({ home: 'TASK', projectId: 'p-wal', taskId: 't1' })).running)
    wordsOnly(model)
  })

  it('ends in words when the reply answers cards, not a person', async () => {
    const { model, h } = longHarness([...fourLookups(), say('So far.')])
    await runTurn(h.deps, h.run({ ...claimed(), trigger: 'CONTINUATION' }).running)
    wordsOnly(model)
  })

  it("ends in words when the person's words cannot be read", async () => {
    const { model, h } = longHarness([...fourLookups(), say('So far.')])
    h.deps.background = { ...h.deps.background!, asked: async () => [] }
    await runTurn(h.deps, h.run().running)
    wordsOnly(model)
  })
})
