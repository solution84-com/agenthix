import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import type { LeadStreamEvent } from '../../../conversations/contract'
import { createModelAdapter } from '../../../conversations/model'
import { requestFor } from '../../../conversations/model/testSupport'
import { titleRequest } from '../../../conversations/coordinator/titling'
import { createScriptedModel, DEMO_MS_PER_WORD, wordPieces } from '../scriptedModel'
import { DEMO_CANNOT_HERE, type DemoTurn } from '../steps'
import { demoScripts } from './demoScripts'

async function collect(iterable: AsyncIterable<LeadStreamEvent>) {
  const events: LeadStreamEvent[] = []
  for await (const event of iterable) events.push(event)
  return events
}

const createTask = { name: 'create_task', description: 'Create a task', input: z.object({}).passthrough() }

function demoAdapter(turn: DemoTurn | null) {
  const waits: number[] = []
  const modelFor = createScriptedModel({
    scripts: async () => demoScripts,
    turnOf: async () => turn,
    sleep: async (ms) => { waits.push(ms) },
  })
  const adapter = createModelAdapter({ languageModel: (_a, _e, call) => modelFor(call.cacheKey), record: () => undefined })
  return { adapter, waits }
}

const asking = (personText: string, turnId = 't1'): DemoTurn =>
  ({ turnId, trigger: 'MESSAGE', agentHandle: 'writer', agentId: 'agent-writer', personId: 'person-1', personText })

describe('the scripted model behind the lead in demo mode @SC-1957', () => {
  it('streams the reply a word at a time at a reading pace, then finishes', async () => {
    const { adapter, waits } = demoAdapter(asking('How is the home page copy coming along?'))
    const events = await collect(adapter.stream(requestFor()))
    const words = events.filter(e => e.type === 'text').map(e => (e as { text: string }).text)
    expect(words).toEqual(wordPieces('The home page copy is in progress.'))
    expect(words.length).toBeGreaterThan(1)
    expect(waits).toEqual(Array(words.length - 1).fill(DEMO_MS_PER_WORD))
    expect(events.at(-1)).toMatchObject({ type: 'finish', reason: 'stop' })
  })

  it("emits the intent's tool calls after its words, for hq's own tools to carry out", async () => {
    const { adapter } = demoAdapter(asking('Make a task for the case study'))
    const events = await collect(adapter.stream(requestFor({ tools: [createTask] })))
    const call = events.find(e => e.type === 'tool-call')
    expect(call).toMatchObject({ type: 'tool-call', call: { name: 'create_task', input: { projectId: 'WEB', title: 'Draft the case study', when: 'later' } } })
    expect(events.findIndex(e => e.type === 'tool-call')).toBeGreaterThan(events.findIndex(e => e.type === 'text'))
    expect(events.at(-1)).toMatchObject({ type: 'finish', reason: 'tool-calls' })
  })

  it('closes the turn after a tool result with a short line, not a second answer @SC-1958', async () => {
    const { adapter } = demoAdapter(asking('Make a task for the case study'))
    await collect(adapter.stream(requestFor({ tools: [createTask] })))
    const events = await collect(adapter.stream(requestFor({
      tools: [createTask],
      messages: [
        { role: 'user', content: 'Make a task for the case study' },
        { role: 'assistant', content: "I've made a task.", toolCalls: [{ id: 'c1', name: 'create_task', input: {} }] },
        { role: 'tool', toolCallId: 'c1', toolName: 'create_task', result: { done: true } },
      ],
    })))
    expect(events.filter(e => e.type === 'text').map(e => (e as { text: string }).text).join('')).toBe('Writer has that under way.')
    expect(events.some(e => e.type === 'tool-call')).toBe(false)
  })

  it("makes a call the script names in the visitor's own space there, as the agent speaking @SC-1956", async () => {
    const asked: string[][] = []
    const modelFor = createScriptedModel({
      scripts: async () => demoScripts, turnOf: async () => asking('Draft a case study for me'), sleep: async () => {},
      spaceFor: async (personId, agentId) => { asked.push([personId, agentId]); return 'space-of-person-1' },
    })
    const adapter = createModelAdapter({ languageModel: (_a, _e, call) => modelFor(call.cacheKey), record: () => undefined })
    const events = await collect(adapter.stream(requestFor({ tools: [createTask] })))
    expect(events.find(e => e.type === 'tool-call')).toMatchObject({
      call: { name: 'create_task', input: { projectId: 'space-of-person-1', assignedAgentId: 'agent-writer', when: 'now', title: 'Draft a case study' } },
    })
    expect(asked).toEqual([['person-1', 'agent-writer']])
  })

  it('answers the next turn afresh', async () => {
    let turn = asking('Make a task for the case study', 't1')
    const modelFor = createScriptedModel({ scripts: async () => demoScripts, turnOf: async () => turn, sleep: async () => {} })
    const adapter = createModelAdapter({ languageModel: (_a, _e, call) => modelFor(call.cacheKey), record: () => undefined })
    await collect(adapter.stream(requestFor({ tools: [createTask] })))
    turn = asking('How is the home page copy coming along?', 't2')
    const events = await collect(adapter.stream(requestFor({ tools: [createTask] })))
    expect(events.filter(e => e.type === 'text').map(e => (e as { text: string }).text).join('')).toBe('The home page copy is in progress.')
  })

  it('makes no call to a tool this turn was not offered, and says it cannot', async () => {
    const { adapter } = demoAdapter(asking('Make a task for the case study'))
    const events = await collect(adapter.stream(requestFor({ tools: [] })))
    expect(events.some(e => e.type === 'tool-call')).toBe(false)
    expect(events.filter(e => e.type === 'text').map(e => (e as { text: string }).text).join('')).toBe(DEMO_CANNOT_HERE)
  })

  it('names the conversation with a short scripted answer @SC-1958', async () => {
    const { adapter } = demoAdapter(null)
    const request = titleRequest({ access: requestFor().access, ask: 'Start a task for the case-study page', reply: 'Done.', conversationId: 'c', signal: new AbortController().signal })
    expect((await adapter.complete(request)).text).toBe('Start a task for the case-study')
  })
})
