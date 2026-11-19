import { describe, expect, it } from 'vitest'
import { CONVERSATION_VOICE_PAGE_SOCKET as VP } from '@agenthix/core'
import { fakeClock } from '../../clock'
import { createVoiceRuntime } from '../../runtime/runtime'
import { VOICE_SETTINGS } from '../../settings'
import { hqBackchannel } from '../hqBackchannel'
import type { LooseSocket } from '../hqSocket'

function setup() {
  const emitted: Array<[string, unknown]> = []
  const socket: LooseSocket = { on: () => undefined, off: () => undefined, emit: (event, payload) => { emitted.push([event, payload]) } }
  const runtime = createVoiceRuntime({
    components: [], settings: VOICE_SETTINGS, clock: fakeClock(), adapters: [hqBackchannel({ socket, conversationId: () => 'c1' })],
  })
  runtime.start()
  // Tone's own event is `../../tone/__tests__/voiceHint.test.ts`'s.
  return { runtime, emitted: { get all() { return emitted.filter(([e]) => e !== VP.voiceTone) } } }
}

describe('the hum service\'s questions on hq\'s socket @SC-2228', () => {
  it('says which question was asked as a pause began, and only that one', () => {
    const h = setup()
    h.runtime.publish({ kind: 'hum.ask', call: 1, text: 'we left early', skipped: 0, t: 0 })
    h.runtime.publish({ kind: 'hum.ask', call: 2, text: 'we left early about 6', skipped: 0, atPause: true, t: 0 })
    expect(h.emitted.all).toEqual([
      [VP.backchannel, { conversationId: 'c1', seq: 1, text: 'we left early' }],
      [VP.backchannel, { conversationId: 'c1', seq: 2, text: 'we left early about 6', atPause: true }],
    ])
  })
})

describe('the sound keeper on hq\'s socket @SC-2228 @SC-2237', () => {
  it('sends the last sounds with a question, and asks for a kind\'s sounds in a tone, warming or not, never by words', () => {
    const h = setup()
    h.runtime.publish({ kind: 'hum.ask', call: 3, text: 'and then', skipped: 0, recent: ['Mm.', 'Right.'], t: 0 })
    h.runtime.publish({ kind: 'hum.speak', tone: 'gentle', hum: 'sympathy', t: 0 })
    h.runtime.publish({ kind: 'hum.speak', tone: 'bright', hum: 'amusement', warm: true, t: 0 })
    expect(h.emitted.all).toEqual([
      [VP.backchannel, { conversationId: 'c1', seq: 3, text: 'and then', recent: ['Mm.', 'Right.'] }],
      [VP.backchannelSpeak, { conversationId: 'c1', kind: 'sympathy', tone: 'gentle' }],
      [VP.backchannelSpeak, { conversationId: 'c1', kind: 'amusement', tone: 'bright', warm: true }],
    ])
  })
})
