import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import type { DemoLeadToolCall, DemoScripts } from '@agenthix/core'
import { DEMO_LEAD_TOOLS, demoLeadToolProblems, type LeadToolInput } from '../tools'
import { leadToolInput } from '../registry'
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { loadDemoScripts } from '@agenthix/core'
import { STARTS_WORK } from '../../../conversations/coordinator/startedWords'
import { OWN_SPACE, THIS_AGENT } from '../ownSpace'
import { demoScripts } from './demoScripts'

const REPO_DEMO = path.resolve(import.meta.dirname, '../../../../../demo')

function withCall(call: DemoLeadToolCall, reply = 'Here it is.'): DemoScripts {
  const lead = demoScripts.agents.writer!.lead
  return { agents: { writer: { runs: [], lead: { ...lead, intents: [{ id: 'one', phrasings: ['one'], reply, toolCalls: [call], voiceClip: null }] } } } }
}

const anyInput: LeadToolInput = name => (['create_task', 'run_task', 'update_org', 'list_tasks'].includes(name) ? z.object({}).passthrough() : null)

describe('the tools a demo lead script may call @SC-1956', () => {
  it('passes task tools the demo allows', () => {
    expect(demoLeadToolProblems(withCall({ toolName: 'list_tasks', input: { projectId: 'WEB' } }), anyInput)).toEqual([])
  })

  it('refuses a tool the lead has but the demo does not allow', () => {
    const problems = demoLeadToolProblems(withCall({ toolName: 'update_org', input: {} }), anyInput)
    expect(problems).toHaveLength(1)
    expect(problems[0]!.message).toMatch(/update_org is not one the demo allows/)
  })

  it('refuses a name the lead has no tool for', () => {
    expect(demoLeadToolProblems(withCall({ toolName: 'make_coffee', input: {} }), anyInput)[0]!.message).toMatch(/not a tool of the conversation lead/)
  })

  it('refuses a reply that says work started with no call that starts any', () => {
    const problems = demoLeadToolProblems(withCall({ toolName: 'list_tasks', input: { projectId: 'WEB' } }, "I've started the draft."), anyInput)
    expect(problems[0]!.message).toMatch(/no call starts any/)
  })

  it("checks each call's input against the lead's real tool, as a turn would", () => {
    expect(demoLeadToolProblems(withCall({ toolName: 'create_task', input: { projectId: 'WEB', title: 'A page', when: 'later' } }), leadToolInput)).toEqual([])
    const problems = demoLeadToolProblems(withCall({ toolName: 'create_task', input: { projectId: 'WEB', title: 'A page' } }), leadToolInput)
    expect(problems[0]!.message).toMatch(/does not fit create_task: when/)
  })

  it('allows only tools every turn of the lead has', () => {
    for (const name of DEMO_LEAD_TOOLS) expect(leadToolInput(name), name).not.toBeNull()
  })

  it("the repository's scripts fit the lead's tools, and start work only in the visitor's own space, as the agent speaking", async () => {
    const scripts = await loadDemoScripts(REPO_DEMO, { list: dir => readdir(dir), read: file => readFile(file, 'utf8') })
    expect(demoLeadToolProblems(scripts, leadToolInput)).toEqual([])
    for (const [handle, agent] of Object.entries(scripts.agents)) {
      for (const intent of agent.lead.intents) {
        for (const call of intent.toolCalls.filter(c => STARTS_WORK.has(c.toolName))) {
          expect(call.toolName, `${handle} ${intent.id}`).toBe('create_task')
          expect(call.input.projectId, `${handle} ${intent.id}`).toBe(OWN_SPACE)
          expect(call.input.assignedAgentId, `${handle} ${intent.id}`).toBe(THIS_AGENT)
        }
      }
    }
  })
})
