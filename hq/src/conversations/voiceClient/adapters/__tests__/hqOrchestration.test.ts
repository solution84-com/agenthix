import { describe, expect, it } from 'vitest'
import { CONVERSATION_SOCKET, CONVERSATION_VOICE_SOCKET as V } from '../../../../shared/conversations/protocol'
import { fakeClock } from '../../clock'
import type { VoiceEvent } from '../../events'
import { createVoiceRuntime } from '../../runtime/runtime'
import { VOICE_SETTINGS } from '../../settings'
import { hqOrchestration, type LooseSocket } from '../hqSocket'

function setup() {
  const handlers = new Map<string, Array<(e: unknown) => void>>()
  const emitted: Array<[string, unknown]> = []
  const socket: LooseSocket = {
    on: (event, h) => { handlers.set(event, [...(handlers.get(event) ?? []), h as never]) },
    off: (event, h) => { handlers.set(event, (handlers.get(event) ?? []).filter(x => x !== (h as never))) },
    emit: (event, payload) => { emitted.push([event, payload]) },
  }
  const receive = (event: string, payload: unknown) => (handlers.get(event) ?? []).forEach(h => h(payload))
  const sentNew: string[] = []
  const runtime = createVoiceRuntime({
    components: [], settings: VOICE_SETTINGS, clock: fakeClock(),
    adapters: [hqOrchestration({ socket, conversationId: () => 'c1', sendNew: t => sentNew.push(t) })],
  })
  runtime.start()
  const out: VoiceEvent[] = []
  runtime.subscribe(['reply.update'], e => out.push(e))
  const send = (text: string, append: boolean) => runtime.publish({ kind: 'orchestration.send', text, append, t: 0 })
  return { runtime, emitted, receive, sentNew, out, send, stop: () => runtime.stop(), handlers }
}

describe('orchestration’s side of hq’s socket', () => {
  it('turns hq’s raised hand into reply.update, for this conversation only', () => {
    const h = setup()
    h.receive(V.update, { conversationId: 'c1', updateId: 'u1', critical: true })
    h.receive(V.update, { conversationId: 'c2', updateId: 'u2', critical: false })
    expect(h.out).toEqual([expect.objectContaining({ kind: 'reply.update', updateId: 'u1', critical: true })])
  })

  it('tells hq the hand is invited', () => {
    const h = setup()
    h.runtime.publish({ kind: 'orchestration.handRaise', updateId: 'u1', state: 'invited', critical: false, t: 0 })
    h.runtime.publish({ kind: 'orchestration.handRaise', updateId: 'u2', state: 'raised', critical: false, t: 0 })
    expect(h.emitted).toEqual([[V.invite, { conversationId: 'c1', updateId: 'u1' }]])
  })

  it('joins words to the message just sent, naming the reply hq is writing for it', () => {
    const h = setup()
    h.receive(CONVERSATION_SOCKET.delta, { conversationId: 'c1', turnId: 'old', offset: 0, text: 'x' })
    h.send('I think we should', false)
    h.receive(CONVERSATION_SOCKET.delta, { conversationId: 'c1', turnId: 'old', offset: 1, text: 'y' })
    h.receive(CONVERSATION_SOCKET.turn, { conversationId: 'c1', turnId: 't1', state: 'RUNNING' })
    h.send('move the launch', true)
    expect(h.emitted).toEqual([[V.continue, { conversationId: 'c1', turnId: 't1', text: 'move the launch' }]])
    // The cancelled reply's last events are not taken for the next one.
    h.receive(CONVERSATION_SOCKET.turn, { conversationId: 'c1', turnId: 't1', state: 'CANCELLED' })
    h.receive(CONVERSATION_SOCKET.turn, { conversationId: 'c1', turnId: 't2', state: 'RUNNING' })
    h.send('and the date', true)
    expect(h.emitted.at(-1)).toEqual([V.continue, { conversationId: 'c1', turnId: 't2', text: 'and the date' }])
  })

  it('joins more words before the reply that answers again is heard of to the same message, naming the reply they cut (#28)', () => {
    const h = setup()
    h.send('I think we should', false)
    h.receive(CONVERSATION_SOCKET.turn, { conversationId: 'c1', turnId: 't1', state: 'RUNNING' })
    h.send('move the launch', true)
    h.send('to March', true)
    expect(h.sentNew).toEqual([])
    expect(h.emitted.map(([, p]) => (p as { turnId: string }).turnId)).toEqual(['t1', 't1'])
    // A message of its own starts afresh: its words join nothing before it.
    h.send('Something else', false)
    h.send('entirely', true)
    expect(h.sentNew).toEqual(['entirely'])
  })

  it('sends the words as a message of their own when hq has not started a reply to join', () => {
    const h = setup()
    h.send('first', false)
    h.send('second', true)
    expect(h.emitted).toEqual([])
    expect(h.sentNew).toEqual(['second'])
  })

  it('leaves the room’s events when it stops', () => {
    const h = setup()
    h.stop()
    expect([...h.handlers.values()].every(list => list.length === 0)).toBe(true)
  })
})
