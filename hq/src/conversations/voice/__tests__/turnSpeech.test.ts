/**
 * A turn spoken to the holder, through the coordinator's turn with the model and the record replaced: the reply
 * is spoken from its stream, and a turn the person spoke over keeps only what they heard, marked interrupted.
 */
import { describe, expect, it } from 'vitest'
import { runTurn } from '../../coordinator/turn'
import { claimed, harness, scriptedModel, usage } from '../../coordinator/__tests__/turnHarness'
import { ModelCallError, type LeadStreamEvent } from '../../contract'
import { CONVERSATION_VOICE_SOCKET as V } from '../../../shared/conversations/voice'
import { VoiceSession } from '../session'

function voice() {
  const sent: { event: string; payload: { text?: string } }[] = []
  const session = new VoiceSession('conv-1', 'u1', new Set(['s1']), {
    async *synthesize(text) { yield { audio: Buffer.from(text), wordTiming: { words: [text], wordStartSecs: [0], wordEndSecs: [1] } } },
    toHolder: (event, payload) => { sent.push({ event, payload: payload as { text?: string } }) },
    speechFailed: () => {},
    now: () => 0,
  })
  return { session, sent }
}

describe('a spoken turn @SC-995', () => {
  it('speaks the reply as it streams and records it whole', async () => {
    const { session, sent } = voice()
    const h = harness(scriptedModel([[{ type: 'text', text: 'Hi there. ' }, { type: 'text', text: 'All good.' }, { type: 'finish', reason: 'stop', usage: usage(1) }]]))
    h.deps.voice = { begin: c => session.speechFor(c.turnId) }
    await runTurn(h.deps, h.run().running)
    await new Promise(r => setTimeout(r, 0))
    expect(sent.filter(s => s.event === V.sentence).map(s => s.payload.text)).toEqual(['Hi there.', 'All good.'])
    expect(h.stored[0]).toMatchObject({ kind: 'TEXT', body: { text: 'Hi there. All good.' }, interrupted: false })
  })

  it('speaks an encouragement response in the relaxed tone, marked for the browser, and reveals it without the direction', async () => {
    const asked: string[] = []
    const sent: { event: string; payload: { text?: string; encouragement?: boolean; words?: string[] } }[] = []
    const session = new VoiceSession('conv-1', 'u1', new Set(['s1']), {
      async *synthesize(text) {
        asked.push(text)
        const words = text.startsWith('[') ? ['[relaxed]', ...text.split(' ').slice(1)] : text.split(' ')
        yield { audio: Buffer.from(text), wordTiming: { words, wordStartSecs: words.map(() => 0), wordEndSecs: words.map(() => 1) } }
      },
      asEncouragement: text => `[relaxed] ${text}`,
      toHolder: (event, payload) => { sent.push({ event, payload: payload as never }) },
      speechFailed: () => {},
      now: () => 0,
    })
    const h = harness(scriptedModel([[{ type: 'text', text: ':::encouragement\nMm? Go on.' }, { type: 'finish', reason: 'stop', usage: usage(1) }]]))
    h.deps.voice = { begin: c => session.speechFor(c.turnId) }
    await runTurn(h.deps, h.run().running)
    await new Promise(r => setTimeout(r, 0))
    expect(asked).toEqual(['[relaxed] Mm?', '[relaxed] Go on.'])
    const sentences = sent.filter(s => s.event === V.sentence).map(s => s.payload)
    expect(sentences.map(s => [s.text, s.encouragement, s.words])).toEqual([['Mm?', true, ['Mm?']], ['Go on.', true, ['Go', 'on.']]])
  })

  it('interrupted, keeps the sentences heard, marked interrupted @SC-997', async () => {
    const { session } = voice()
    let controller!: AbortController
    async function* step(): AsyncGenerator<LeadStreamEvent> {
      yield { type: 'text', text: 'First point. Second point. ' }
      session.interrupt('turn-1', 0)
      controller.abort('interrupt')
      throw new ModelCallError('cancelled', 'The reply was stopped.')
    }
    const h = harness(scriptedModel([step]))
    h.deps.voice = { begin: c => session.speechFor(c.turnId) }
    const run = h.run(claimed())
    controller = run.controller
    const outcome = await runTurn(h.deps, run.running)
    expect(outcome.state).toBe('CANCELLED')
    expect(h.stored[0]).toMatchObject({ kind: 'TEXT', body: { text: 'First point.' }, interrupted: true })
  })

  it('a turn nobody listens to is not spoken and keeps all it streamed when stopped', async () => {
    let controller!: AbortController
    async function* step(): AsyncGenerator<LeadStreamEvent> {
      yield { type: 'text', text: 'Written. Not said.' }
      controller.abort('stop')
      throw new ModelCallError('cancelled', 'The reply was stopped.')
    }
    const h = harness(scriptedModel([step]))
    h.deps.voice = { begin: () => null }
    const run = h.run()
    controller = run.controller
    await runTurn(h.deps, run.running)
    expect(h.stored[0]).toMatchObject({ body: { text: 'Written. Not said.' }, interrupted: true })
  })
})
