/**
 * One spoken message, one turn that answers it (#28), against the real test database and hq's own coordinator: the
 * person's words keep joining their message while its reply is unheard, and every reply cut for them is withdrawn at
 * once, so none queues behind another and only the last, which answers the whole message, is kept. The model, the
 * speech service and the turn's access are replaced; the claim, the lock, the rerun and voice's session are hq's.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { prisma } from '../../../test/db'
import { createAgent, createConversation, createUserWithRole } from '../../../test/factories'
import { ModelCallError, type LeadStreamEvent, type ModelAdapter } from '../../contract'

process.env.SECRETS_MASTER_KEY = Buffer.alloc(32, 5).toString('base64')

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<any>('wasp/server')
  const { prisma } = await import('../../../test/db')
  return { ...actual, prisma }
})
// The real coordinator runs every turn, on the deps below; it is loaded only when first asked for, never inside this
// mock's own import, so every module that schedules a conversation is handed this one (see continue.integration.test.ts).
vi.mock('../../coordinator/scheduler', () => ({
  scheduleConversation: (conversationId: string) => {
    const running = (async () => {
      const real = await vi.importActual<typeof import('../../coordinator/scheduler')>('../../coordinator/scheduler')
      await real.driveConversation(conversationId, { ...real.turnDeps, ...replaced() })
    })()
    drives.push(running)
  },
  stopRunningTurn: async (...args: Parameters<typeof import('../../coordinator/scheduler')['stopRunningTurn']>) =>
    (await vi.importActual<typeof import('../../coordinator/scheduler')>('../../coordinator/scheduler')).stopRunningTurn(...args),
}))
vi.mock('../../model', () => ({
  createModelAdapter: () => ({
    stream: () => { throw new Error('Only the test deps model is called') },
    complete: async () => { throw new Error('Only the test deps model is called') },
  }),
}))
vi.mock('../../../voice/inworldAdapter', () => ({
  inworldTtsAdapter: { async *synthesizeStream(text: string) { yield { audio: Buffer.from(text) } } },
}))

import type { TurnDeps } from '../../coordinator/turn'
import { turnCapability } from '../../../server/controlplane/__tests__/turnFixtures'
import { admitMessage } from '../../coordinator/admission'
import { toMessageView } from '../../store/messages'
import { setUpVoiceProviders } from './voiceFixtures'
import { resetVoiceSessions } from '../registry'
import { startVoice } from '../service'
import { continueVoice } from '../continue'

const drives: Promise<void>[] = []

/** A model whose every call waits until the test lets it answer, and stops when its turn is cut. */
const model = (() => {
  const open = new Map<string, { asked: string; answer(): void }>()
  const calls: string[] = []
  const adapter: ModelAdapter = {
    async *stream(request): AsyncGenerator<LeadStreamEvent> {
      const turnId = request.system[0]!.text.replace(TURN, '')
      const last = request.messages.at(-1)
      const asked = last && 'content' in last ? last.content : ''
      calls.push(turnId)
      let answer!: () => void
      const answered = new Promise<void>(r => { answer = r })
      open.set(turnId, { asked, answer })
      const cut = new Promise<void>(r => request.signal.addEventListener('abort', () => r(), { once: true }))
      await Promise.race([answered, cut])
      open.delete(turnId)
      if (request.signal.aborted) throw new ModelCallError('cancelled', 'The reply was stopped.')
      yield { type: 'text', text: `Answer to: ${asked}` }
      yield { type: 'finish', reason: 'stop', usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0 } }
    },
    async complete() { throw new Error('not used') },
  }
  return {
    adapter, calls,
    /** Waits until a call is waiting that is not one of `seen`; null when none comes in time. */
    async next(seen: readonly string[], ms = 2_000): Promise<string | null> {
      for (const until = Date.now() + ms; Date.now() < until; await new Promise(r => setTimeout(r, 10))) {
        const fresh = [...open.keys()].find(id => !seen.includes(id))
        if (fresh) return fresh
      }
      return null
    },
    answerAll() { for (const call of open.values()) call.answer() },
    reset() { open.clear(); calls.length = 0 },
  }
})()

/** The context names its turn, so the model knows which turn it answers. */
const TURN = 'turn '

function replaced(): Partial<TurnDeps> {
  return {
    model: model.adapter,
    async titleConversation() {},
    async resolveAccess() {
      return { access: { providerId: 'p-ant', providerName: 'Anthropic', provider: 'anthropic', model: 'claude-sonnet-5', apiKey: 'sk-test-fake' }, problem: null, offer: null }
    },
    async fixTalkingAccess() { return true },
    async clock() { return null },
    async mint({ turnId, actingUserId, trigger }) { return turnCapability({ turnId, actingUserId, trigger }) },
    tools: { async toolsFor() { return [] }, async call() { return { status: 'refused', reason: 'none' } } },
    async context(_conversation, _agentId, turn) {
      const rows = await prisma.conversationMessage.findMany({ where: { id: { in: turn.inputIds } }, orderBy: { seq: 'asc' } })
      const asked = rows.map(toMessageView).map(m => (m.kind === 'TEXT' ? m.body.text : '')).join(' / ')
      return { system: [{ text: `${TURN}${turn.turnId}` }], messages: [{ role: 'user' as const, content: asked }] }
    },
  }
}

async function settled() {
  model.answerAll()
  for (let i = 0; i < 5; i++) {
    await Promise.all(drives.splice(0))
    model.answerAll()
  }
}

beforeEach(() => { resetVoiceSessions(); model.reset(); drives.length = 0 })
afterEach(async () => { await settled(); resetVoiceSessions() })

describe('one spoken message, one turn that answers it (#28) @SC-1837', () => {
  it('words that keep coming before any reply is heard join the one message; every reply they cut is withdrawn at once', async () => {
    await setUpVoiceProviders()
    const person = await createUserWithRole('MEMBER')
    const agent = await createAgent({ name: 'Kernel' })
    const conversation = await createConversation({ openedById: person.id, agentId: agent.id })
    await startVoice('s1', person.id, conversation.id)

    await admitMessage({ conversationId: conversation.id, text: 'what about the build', clientMessageId: 'm1', spoken: true }, person.id)
    const first = await model.next([])
    expect(first).not.toBeNull()

    await continueVoice('s1', person.id, conversation.id, first!, 'and the tests')
    const second = await model.next([first!])
    expect(second).not.toBeNull()

    // The browser has not heard of the second turn yet: it names the reply its last words cut.
    await continueVoice('s1', person.id, conversation.id, first!, 'and the deploy')
    const third = await model.next([first!, second!])
    expect(third).not.toBeNull()
    await settled()

    const people = await prisma.conversationMessage.findMany({ where: { conversationId: conversation.id, role: 'PERSON' } })
    expect(people.map(toMessageView).map(m => (m.kind === 'TEXT' ? m.body.text : m.kind))).toEqual(['what about the build and the tests and the deploy'])
    const kept = (await prisma.conversationMessage.findMany({ where: { conversationId: conversation.id, role: 'AGENT', withdrawn: false } })).map(toMessageView)
    expect(kept.map(m => [m.turnId, m.kind === 'TEXT' ? m.body.text : m.kind])).toEqual([[third, 'Answer to: what about the build and the tests and the deploy']])
    const turns = await prisma.inferenceTurn.findMany({ where: { conversationId: conversation.id }, orderBy: { startedAt: 'asc' } })
    expect(turns.map(t => [t.id, t.state])).toEqual([[first, 'CANCELLED'], [second, 'CANCELLED'], [third, 'COMPLETED']])
  })
})
