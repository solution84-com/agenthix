import { describe, expect, it, vi } from 'vitest'
import { CONVERSATION_VOICE_SOCKET as V, VOICE_SILENCE_END_MS, VOICE_SILENCE_WARNING_MS } from '../../../shared/conversations/voice'
import { SPEECH_FAILED, VoiceSession, type VoiceSessionDeps } from '../session'

/** A speech service that says each word in half a second, with tokens of space between, as the real one does. */
function fakeSpeech(opts: { failOn?: string; gate?: Promise<void> } = {}) {
  const said: string[] = []
  async function* synthesize(text: string): AsyncGenerator<{ audio: Buffer; wordTiming?: { words: string[]; wordStartSecs: number[]; wordEndSecs: number[] } }> {
    if (opts.gate) await opts.gate
    if (opts.failOn && text.includes(opts.failOn)) throw new Error('speech service down')
    said.push(text)
    const words = text.split(' ')
    const tokens = words.flatMap((w, i) => (i ? [' ', w] : [w]))
    yield {
      audio: Buffer.from(text),
      wordTiming: { words: tokens, wordStartSecs: tokens.map((_, i) => i * 0.25), wordEndSecs: tokens.map((_, i) => i * 0.25 + 0.25) },
    }
  }
  return { said, synthesize }
}

function setup(speech = fakeSpeech()) {
  const sent: { event: string; payload: Record<string, unknown> }[] = []
  let clock = 0
  const deps: VoiceSessionDeps = {
    synthesize: (text) => speech.synthesize(text),
    toHolder: (event, payload) => { sent.push({ event, payload: payload as Record<string, unknown> }) },
    speechFailed: vi.fn(),
    now: () => clock,
  }
  const session = new VoiceSession('conv-1', 'u1', new Set(['s1']), deps)
  const settle = () => new Promise(r => setTimeout(r, 0))
  return { session, sent, deps, speech, settle, tick: (ms: number) => { clock += ms } }
}

describe('a turn spoken to the holder @SC-995', () => {
  it('sends each sentence with its words, timings and offsets before its audio, then that the turn is spoken', async () => {
    const { session, sent, settle } = setup()
    const speech = session.speechFor('t1')
    speech.text('Hello there. How')
    await settle()
    expect(speech.end('COMPLETED', 'Hello there. How are you?')).toEqual({ text: 'Hello there. How are you?', interrupted: false })
    await settle()
    expect(sent.map(s => s.event)).toEqual([V.sentence, V.audio, V.sentence, V.audio, V.turnSpoken])
    expect(sent[0]!.payload).toMatchObject({ turnId: 't1', index: 0, text: 'Hello there.', textStart: 0, textEnd: 12, words: ['Hello', 'there.'], wordStartSecs: [0, 0.5] })
    expect(sent[2]!.payload).toMatchObject({ index: 1, text: 'How are you?', textStart: 13, textEnd: 25 })
    expect(sent[4]!.payload).toEqual({ conversationId: 'conv-1', turnId: 't1', sentences: 2 })
  })

  it("queues a new turn's speech behind the sentence playing, never over it", async () => {
    let open!: () => void
    const { session, sent, settle } = setup(fakeSpeech({ gate: new Promise<void>(r => { open = r }) }))
    const first = session.speechFor('t1')
    first.end('COMPLETED', 'One. Two.')
    const report = session.speechFor('t2')
    report.end('COMPLETED', 'The tests passed.')
    open()
    await settle(); await settle()
    const order = sent.filter(s => s.event === V.sentence || s.event === V.turnSpoken).map(s => `${s.event}:${s.payload.turnId}`)
    expect(order).toEqual([`${V.sentence}:t1`, `${V.sentence}:t1`, `${V.turnSpoken}:t1`, `${V.sentence}:t2`, `${V.turnSpoken}:t2`])
  })

  it('a stopped or failed turn says nothing more and tells the holder it is done', async () => {
    const { session, sent, settle } = setup()
    const speech = session.speechFor('t1')
    expect(speech.end('CANCELLED', 'Never heard of it.')).toEqual({ text: 'Never heard of it.', interrupted: true })
    await settle()
    expect(sent).toEqual([{ event: V.turnSpoken, payload: { conversationId: 'conv-1', turnId: 't1', sentences: 0 } }])
  })
})

describe('an interruption @SC-997', () => {
  it('stops every sentence, and the turn keeps only the sentences heard', async () => {
    let open!: () => void
    const { session, sent, settle } = setup(fakeSpeech({ gate: new Promise<void>(r => { open = r }) }))
    const speech = session.speechFor('t1')
    speech.text('First point. Second point. Third ')
    session.interrupt('t1', 0)
    open()
    await settle()
    expect(sent.filter(s => s.event === V.sentence)).toEqual([])
    expect(speech.end('CANCELLED', 'First point. Second point. Third point.')).toEqual({ text: 'First point.', interrupted: true })
    expect(session.heardThrough('t1')).toBe(0)
  })

  it('reaching a turn as it completes, still keeps only what was heard', () => {
    const { session } = setup()
    const speech = session.speechFor('t1')
    session.interrupt('t1', -1)
    expect(speech.end('COMPLETED', 'All of it.')).toEqual({ text: '', interrupted: true })
  })

  it('marks a turn withdrawn when the person\'s words joined the message it answers', () => {
    const { session } = setup()
    const speech = session.speechFor('t1')
    session.interrupt('t1', -1, true)
    expect(speech.end('CANCELLED', 'All of it.')).toEqual({ text: '', interrupted: true, withdrawn: true })
  })

  it('mid-sentence, keeps the words heard of the sentence it stopped in', async () => {
    const { session, settle } = setup()
    const speech = session.speechFor('t1')
    speech.text('First point. Second point is this. ')
    await settle(); await settle()
    // Of "Second point is this.", spoken as four timed words, two were heard.
    session.interrupt('t1', 0, false, 2)
    expect(speech.end('CANCELLED', 'First point. Second point is this. Third.')).toEqual({ text: 'First point. Second point', interrupted: true })
  })

  it('a turn spoken over after its speech ended: the message it records is cut once, to the words heard', async () => {
    const { session, settle } = setup()
    const speech = session.speechFor('t1')
    speech.text('One two three. Four five six. ')
    await settle(); await settle()
    expect(speech.end('COMPLETED', 'One two three. Four five six.')).toEqual({ text: 'One two three. Four five six.', interrupted: false })
    session.interrupt('t1', 0, false, 1)
    const toCut = session.toCut('t1')
    speech.written('m1')
    expect(await toCut).toBe('m1')
    expect(session.cutOf('t1', 'One two three. Four five six.')).toBe('One two three. Four')
    expect(session.cutOf('t1', 'One two three. Four')).toBeUndefined()
  })

  it('a turn that kept only what was heard as it ended has nothing left to cut', async () => {
    const { session } = setup()
    const speech = session.speechFor('t1')
    session.interrupt('t1', -1)
    speech.end('CANCELLED', 'All of it.')
    speech.written('m1')
    expect(await session.toCut('t1')).toBeNull()
  })

  it('a turn still speaking is not cut in the record: its end keeps what was heard', async () => {
    const { session } = setup()
    session.speechFor('t1')
    session.interrupt('t1', -1)
    expect(await session.toCut('t1')).toBeNull()
    expect(session.spoke('t1')).toBe(true)
    expect(session.spoke('other')).toBe(false)
  })

  it('a turn after it is spoken again: voice stays up', async () => {
    const { session, sent, settle } = setup()
    session.speechFor('t1')
    session.interrupt('t1', -1)
    session.speechFor('t2').end('COMPLETED', 'Go on.')
    await settle()
    expect(sent.filter(s => s.event === V.sentence).map(s => s.payload.turnId)).toEqual(['t2'])
  })
})

describe('text to speech failing mid-turn @SC-1000', () => {
  it('finishes the reply as text, with one line why, once', async () => {
    const { session, sent, deps, settle } = setup(fakeSpeech({ failOn: 'Second' }))
    const speech = session.speechFor('t1')
    expect(speech.end('COMPLETED', 'First. Second. Third.').text).toBe('First. Second. Third.')
    await settle(); await settle()
    expect(sent.map(s => s.event)).toEqual([V.sentence, V.audio, V.error, V.turnSpoken])
    expect(sent[2]!.payload).toEqual({ conversationId: 'conv-1', message: SPEECH_FAILED })
    expect(deps.speechFailed).toHaveBeenCalledExactlyOnceWith('t1')
  })
})

describe('the silence rule @SC-1000', () => {
  it('warns fifteen seconds before two minutes of silence, once, then ends', () => {
    const { session, sent, tick } = setup()
    tick(VOICE_SILENCE_END_MS - VOICE_SILENCE_WARNING_MS - 1)
    expect(session.silenceCheck()).toBeNull()
    tick(1)
    expect(session.silenceCheck()).toBe('warn')
    expect(sent.at(-1)).toEqual({ event: V.silenceWarning, payload: { conversationId: 'conv-1', endsInMs: VOICE_SILENCE_WARNING_MS } })
    expect(session.silenceCheck()).toBeNull()
    tick(VOICE_SILENCE_WARNING_MS)
    expect(session.silenceCheck()).toBe('end')
  })

  it('the person speaking, or a reply being written, is not silence', () => {
    const { session, tick } = setup()
    tick(VOICE_SILENCE_END_MS - 1)
    session.activity()
    tick(VOICE_SILENCE_END_MS - 1)
    expect(session.silenceCheck()).toBe('warn')
    session.speechFor('t1')
    tick(VOICE_SILENCE_END_MS * 2)
    expect(session.silenceCheck()).toBeNull()
  })

  it('the agent speaking is not silence: it counts from the end of what was said', async () => {
    const { session, settle, tick } = setup()
    session.speechFor('t1').end('COMPLETED', 'A sentence of five words.')
    await settle()
    tick(VOICE_SILENCE_END_MS)
    expect(session.silenceCheck()).toBe('warn')
  })
})

describe('voice ending with a turn running @SC-1000', () => {
  it('speaks nothing more; the turn finishes as text', async () => {
    const { session, sent, settle } = setup()
    const speech = session.speechFor('t1')
    session.close()
    speech.text('More words. And more ')
    expect(speech.end('COMPLETED', 'More words. And more.')).toEqual({ text: 'More words. And more.', interrupted: false })
    await settle()
    expect(sent).toEqual([])
  })
})

describe('the outbound buffer', () => {
  /** A speech service whose every sentence is one second of audio; waiting moves the clock on. */
  function buffered(opts: { slowMs?: number } = {}) {
    const sent: { event: string; payload: Record<string, unknown> }[] = []
    const waits: number[] = []
    let clock = 0
    let hold: (() => void) | null = null
    const deps: VoiceSessionDeps = {
      async *synthesize() {
        if (opts.slowMs) clock += opts.slowMs
        yield { audio: Buffer.alloc(48_000) }
      },
      toHolder: (event, payload) => { sent.push({ event, payload: payload as Record<string, unknown> }) },
      speechFailed: vi.fn(),
      now: () => clock,
      wait: (ms, signal) => {
        waits.push(ms)
        if (opts.slowMs === undefined && waits.length === 1 && signal) {
          // The first wait is held open until the test lets it go, or the signal ends it.
          return new Promise<void>(resolve => {
            hold = () => { clock += ms; resolve() }
            signal.addEventListener('abort', () => resolve(), { once: true })
          })
        }
        clock += ms
        return Promise.resolve()
      },
      sentencesAhead: 2,
    }
    const session = new VoiceSession('conv-1', 'u1', new Set(['s1']), deps)
    const settle = async () => { for (let i = 0; i < 10; i++) await new Promise(r => setTimeout(r, 0)) }
    return { session, sent, waits, settle, release: () => hold?.() }
  }
  const sentences = (sent: { event: string; payload: Record<string, unknown> }[]) => sent.filter(s => s.event === V.sentence).map(s => s.payload.index)

  it('runs at most two sentences ahead of what the holder has heard', async () => {
    const { session, sent, waits, settle, release } = buffered()
    session.speechFor('t1').end('COMPLETED', 'One. Two. Three. Four.')
    await settle()
    expect(sentences(sent)).toEqual([0, 1])
    expect(waits).toEqual([1000])
    release()
    await settle()
    expect(sentences(sent)).toEqual([0, 1, 2, 3])
    expect(waits).toEqual([1000, 1000])
  })

  it('a slow speech service is a pause, never a wait on top of it', async () => {
    const { session, sent, waits, settle } = buffered({ slowMs: 1500 })
    session.speechFor('t1').end('COMPLETED', 'One. Two. Three.')
    await settle()
    expect(sentences(sent)).toEqual([0, 1, 2])
    expect(waits).toEqual([])
  })

  it('speaking over it while a sentence waits sends nothing more', async () => {
    const { session, sent, settle } = buffered()
    session.speechFor('t1').end('COMPLETED', 'One. Two. Three. Four.')
    await settle()
    session.interrupt('t1', 0)
    await settle()
    expect(sentences(sent)).toEqual([0, 1])
  })
})

describe('a turn the agent held open (keep_listening)', () => {
  it('stops its speech, tells the holder it was held instead of spoken, and keeps nothing of what it wrote', async () => {
    let open!: () => void
    const { session, sent, settle } = setup(fakeSpeech({ gate: new Promise<void>(r => { open = r }) }))
    const speech = session.speechFor('t1')
    speech.text('Sure. Let me ')
    speech.hold()
    open()
    await settle(); await settle()
    expect(speech.end('COMPLETED', 'Sure. Let me ')).toEqual({ text: '', interrupted: true, withdrawn: true })
    await settle()
    expect(sent.map(s => s.event)).toEqual([V.turnHeld])
    expect(sent[0]!.payload).toEqual({ conversationId: 'conv-1', turnId: 't1' })
    expect(session.wasHeld('t1')).toBe(true)
    expect(session.wasHeld('t2')).toBe(false)
  })

  it("leaves another turn's speech playing", async () => {
    const { session, sent, settle } = setup()
    session.speechFor('t1').end('COMPLETED', 'The tests passed.')
    const held = session.speechFor('t2')
    held.hold()
    held.hold()
    await settle(); await settle()
    expect(sent.filter(s => s.event !== V.audio).map(s => `${s.event}:${s.payload.turnId}`))
      .toEqual([`${V.turnHeld}:t2`, `${V.sentence}:t1`, `${V.turnSpoken}:t1`])
  })
})
