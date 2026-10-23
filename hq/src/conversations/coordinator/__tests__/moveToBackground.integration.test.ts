/**
 * hq's own move of a long reply to the background (walkthrough findings 28 and 30), against the real test
 * database: after 4 lookups the work is started through start_work's own path — admitted, an operation on the
 * conversation's standing worker in the conversation's own place, its line in the thread — with the brief hq
 * wrote, and the reply ends with the fixed line. No model call writes the brief or the reply.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { prisma } from '../../../test/db'

process.env.SECRETS_MASTER_KEY = Buffer.alloc(32, 7).toString('base64')

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<object>('wasp/server')
  const { prisma } = await import('../../../test/db')
  return { ...actual, prisma }
})
vi.mock('../../../agents/dispatchService', () => import('../../../test/fakes/dispatchService'))
vi.mock('../../../sessions/siteRuntimeStore', () => import('../../../test/fakes/siteRuntimeStore'))
vi.mock('../mailbox', async () => {
  const { spyMailbox } = await import('../../work/workers/__tests__/workerFixtures')
  const { createSettleOperation } = await import('../../work/settle')
  const mailbox = spyMailbox()
  return { mailbox, settleOperation: createSettleOperation(() => mailbox) }
})
const pumped = vi.hoisted(() => [] as (string | null)[])
vi.mock('../../work/workers/queue', async () => {
  const actual = await vi.importActual<object>('../../work/workers/queue')
  return { ...actual, schedulePump: (id: string | null) => { pumped.push(id) } }
})

import { appendMessage, readMessages } from '../../store/messages'
import { openText } from '../../sealing'
import { toolAdapter } from '../../tools/toolAdapter'
import { driveConversation, turnDeps } from '../scheduler'
import { MOVED_TO_BACKGROUND } from '../moveToBackground'
import type { TurnDeps } from '../turn'
import type { LeadRequest, LeadStreamEvent, ToolAdapter } from '../../contract'
import { world, type World } from '../../work/workers/__tests__/workerFixtures'

const ASK = 'Find the stale tasks in Shop,\nand tell me who owns each.'
const finish = (reason: 'stop' | 'tool-calls'): LeadStreamEvent => ({ type: 'finish', reason, usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0 } })

let w: World
beforeEach(async () => {
  pumped.length = 0
  w = await world()
})

/** A model that looks something up at every call it is free to, and answers in words when it may not. */
function deps(requests: LeadRequest[]): TurnDeps {
  // Lookups are answered here; start_work, which hq calls itself, goes through the real adapter.
  const tools: ToolAdapter = {
    toolsFor: capability => toolAdapter.toolsFor(capability),
    async call(capability, call, options) {
      if (call.name === 'start_work') return toolAdapter.call(capability, call, options)
      return { status: 'done', operationId: `lookup-${call.id}`, result: { projects: [{ key: w.project.key, name: 'Shop' }] } }
    },
  }
  return {
    ...turnDeps,
    tools,
    async resolveAccess() { return { access: { providerId: 'p-ant', providerName: 'Anthropic', provider: 'anthropic', model: 'claude-sonnet-5', apiKey: 'sk-test-fake' }, problem: null, offer: null } },
    async fixTalkingAccess() { return true },
    async titleConversation() {},
    async context() { return { system: [{ text: 'base' }], messages: [{ role: 'user', content: ASK }] } },
    model: {
      async *stream(request): AsyncGenerator<LeadStreamEvent> {
        requests.push(request)
        if (request.toolChoice === 'none') {
          yield { type: 'text', text: 'Here is what I found so far.' }
          yield finish('stop')
          return
        }
        yield { type: 'tool-call', call: { id: `c${requests.length}`, name: 'list_projects', input: {} } }
        yield finish('tool-calls')
      },
      async complete() { throw new Error('not used') },
    },
  }
}

async function asks(conversationId: string) {
  await appendMessage({ conversationId, role: 'PERSON', kind: 'TEXT', body: { text: ASK }, authorId: w.person.id, clientMessageId: `ask-${Math.random()}` })
}

describe("hq's own move to the background @SC-967", () => {
  it("starts the work in the person's own space with its brief, shows it, and ends with the fixed reply", async () => {
    await asks(w.conversation.id)
    const requests: LeadRequest[] = []

    await driveConversation(w.conversation.id, deps(requests))

    expect(requests).toHaveLength(4)
    const operation = await prisma.operation.findFirstOrThrow({ where: { conversationId: w.conversation.id, toolName: 'start_work' } })
    expect(operation).toMatchObject({ kind: 'WORKER', mode: 'BACKGROUND', state: 'QUEUED', boundaryType: 'user', boundaryId: w.person.id, authorisedById: w.person.id })
    expect(openText(operation.title)).toBe('Find the stale tasks in Shop,')
    const brief = openText(operation.brief!)
    expect(brief).toContain(`What they asked, word for word:\n\n${ASK}\n`)
    expect(brief).toContain("Work only in the person's own space")
    expect(brief).toContain('list_projects {} →')
    expect(pumped).toEqual([operation.workerSessionId])

    const thread = (await readMessages(w.conversation.id, { limit: 10 })).reverse()
    expect(thread.map(m => [m.role, m.kind])).toEqual([['PERSON', 'TEXT'], ['AGENT', 'OPERATION_STARTED'], ['AGENT', 'TEXT']])
    expect(thread[1]!.operationId).toBe(operation.id)
    expect(thread[2]!.body).toMatchObject({ text: MOVED_TO_BACKGROUND })
  })

  it("starts it in a project conversation's own project", async () => {
    const conversation = await prisma.conversation.create({ data: { home: 'PROJECT', projectId: w.project.id, openedById: w.person.id, agentId: w.agent.id } })
    await asks(conversation.id)

    await driveConversation(conversation.id, deps([]))

    const operation = await prisma.operation.findFirstOrThrow({ where: { conversationId: conversation.id, toolName: 'start_work' } })
    expect(operation).toMatchObject({ boundaryType: 'project', boundaryId: w.project.id })
    expect(openText(operation.brief!)).toContain('Work only in the Shop project')
  })

  it('ends in words, starting nothing, where the agent may not start work', async () => {
    await prisma.agent.update({ where: { id: w.agent.id }, data: { allowedTools: [{ name: 'start_work', state: 'never' }] } })
    await asks(w.conversation.id)
    const requests: LeadRequest[] = []

    await driveConversation(w.conversation.id, deps(requests))

    expect(requests).toHaveLength(5)
    expect(requests[4]!.toolChoice).toBe('none')
    expect(await prisma.operation.count({ where: { conversationId: w.conversation.id, toolName: 'start_work' } })).toBe(0)
    const thread = (await readMessages(w.conversation.id, { limit: 10 })).reverse()
    expect(thread.at(-1)!.body).toMatchObject({ text: 'Here is what I found so far.' })
  })
})
