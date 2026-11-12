import { describe, expect, it } from 'vitest'
import { parseSummariserAnswer } from '../../../conversations/long/summariser'
import {
  DEMO_DONE_LINE, DEMO_NO_SCRIPT, DEMO_NOTHING_MORE, DEMO_REPORT_LINE, DEMO_WAITING_LINE,
  demoSummary, demoTitle, firstStep, followUpStep, type DemoTurn,
} from '../steps'
import { demoScripts } from './demoScripts'

const turn = (personText: string, over: Partial<DemoTurn> = {}): DemoTurn =>
  ({ turnId: 't1', trigger: 'MESSAGE', agentHandle: 'writer', agentId: 'agent-writer', personId: 'person-1', personText, ...over })

describe('the first step of a demo turn @SC-1957', () => {
  it("answers with the nearest intent's reply and its tool calls", () => {
    expect(firstStep(demoScripts, turn('make a task for the case study please'))).toEqual({
      text: "I've made a task for the case study.",
      toolCalls: [{ toolName: 'create_task', input: { projectId: 'WEB', title: 'Draft the case study', when: 'later' } }],
    })
    expect(firstStep(demoScripts, turn('how is the home page copy?'))).toEqual({ text: 'The home page copy is in progress.', toolCalls: [] })
  })

  it("answers words that match nothing with the agent's fallback, and calls nothing", () => {
    expect(firstStep(demoScripts, turn('delete every user'))).toEqual({ text: 'This is a demo. Try asking about the home page.', toolCalls: [] })
  })

  it('says only that it is a demo for an agent with no script, or a call outside a turn', () => {
    expect(firstStep(demoScripts, turn('make a task for the case study', { agentHandle: 'kernel' }))).toEqual({ text: DEMO_NO_SCRIPT, toolCalls: [] })
    expect(firstStep(demoScripts, null)).toEqual({ text: DEMO_NO_SCRIPT, toolCalls: [] })
  })

  it("presents finished work in the agent's own line, calling nothing, whatever the last words were", () => {
    expect(firstStep(demoScripts, turn('make a task for the case study', { trigger: 'REPORT' }))).toEqual({ text: "Writer's work has come back.", toolCalls: [] })
    expect(firstStep(demoScripts, turn('anything', { trigger: 'REPORT', agentHandle: 'kernel' }))).toEqual({ text: DEMO_REPORT_LINE, toolCalls: [] })
  })
})

describe("a later step of a demo turn, in the agent's own lines @SC-1958", () => {
  const lead = demoScripts.agents.writer!.lead

  it('says done, waiting and refused as the agent says them, so each has its clip', () => {
    expect(followUpStep([{ toolName: 'create_task', output: { taskId: 't' } }], lead).text).toBe('Writer has that under way.')
    expect(followUpStep([{ toolName: 'run_task', output: { status: 'waitingApproval' } }], lead).text).toBe('Writer waits for your okay.')
    expect(followUpStep([{ toolName: 'run_task', output: { status: 'refused', reason: 'you can only read Website relaunch, not start work there.' } }], lead).text)
      .toBe("Writer couldn't do that. You can only read Website relaunch, not start work there.")
  })

  it('adds nothing after lookups alone, and says nothing more was started when nothing came back', () => {
    expect(followUpStep([{ toolName: 'list_projects', output: {} }], lead).text).toBe('')
    expect(followUpStep([], lead).text).toBe(DEMO_NOTHING_MORE)
  })
})

describe('a later step of a demo turn @SC-1958', () => {
  it('closes the turn with a line on what the tools gave, calling nothing', () => {
    expect(followUpStep([{ toolName: 'run_task', output: { status: 'refused', reason: 'The demo does not allow that.' } }])).toEqual({ text: "That didn't go through: The demo does not allow that.", toolCalls: [] })
    expect(followUpStep([{ toolName: 'run_task', output: { operationId: 'o', status: 'waitingApproval' } }]).text).toBe(DEMO_WAITING_LINE)
    expect(followUpStep([{ toolName: 'create_task', output: { taskId: 't' } }]).text).toBe(DEMO_DONE_LINE)
    expect(followUpStep([]).text).toBe(DEMO_NOTHING_MORE)
  })

  it('adds nothing after lookups alone, whose finds the reply already gave', () => {
    expect(followUpStep([{ toolName: 'list_projects', output: { projects: [] } }, { toolName: 'list_active_runs', output: { runs: [] } }])).toEqual({ text: '', toolCalls: [] })
    expect(followUpStep([{ toolName: 'get_task_details', output: { status: 'refused', reason: 'Not found' } }]).text).toBe("That didn't go through: Not found.")
  })
})

describe('whole answers in demo mode @SC-1958', () => {
  it("names a conversation from the person's first words", () => {
    expect(demoTitle('The person said: how is the home page copy coming along today?\n\nThe reply: Fine.')).toBe('How is the home page copy')
    expect(demoTitle('')).toBe('A demo conversation')
  })

  it('summarises in the JSON the summariser reads', () => {
    expect(parseSummariserAnswer(demoSummary()).brief).toBe('A conversation in the demo.')
  })
})
