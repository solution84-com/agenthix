import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SpeechToTextHandlers } from '../../ports'
import { heard, NO_WORDS, type ReconcilerState } from '../../stt/reconciler'
import { speechService } from '../../stt'
import { INWORLD_STT_URL, inworldHearing, readInworldMessage, transcribeConfig, TURN_CAP_SOFT_MS } from '../inworldHearing'
import {
  CUT_AT_THIRTY_SECONDS, ERROR_TOKEN_USED, final, partial, PAUSE, SHORT_ANSWERS, SHORT_ANSWERS_TURNS, TIMED_FINAL, TIMED_PARTIAL,
} from './inworldFrames'

class FakeSocket {
  static OPEN = 1
  static last: FakeSocket | null = null
  readyState = 0
  bufferedAmount = 0
  binaryType = 'blob'
  sent: unknown[] = []
  onopen: (() => void) | null = null
  onmessage: ((e: { data: string }) => void) | null = null
  onclose: (() => void) | null = null
  constructor(public url: string, public protocols?: string[]) { FakeSocket.last = this }
  send(data: unknown) { this.sent.push(data) }
  close() { this.readyState = 3 }
  open() { this.readyState = 1; this.onopen?.() }
  hear(frames: string[]) { for (const data of frames) this.onmessage?.({ data }) }
}

function handlers() {
  return { onWords: vi.fn(), onClose: vi.fn(), onError: vi.fn() } satisfies SpeechToTextHandlers
}

async function connected(config?: Record<string, string>) {
  vi.stubGlobal('WebSocket', FakeSocket)
  const h = handlers()
  const connecting = inworldHearing({ token: 'one-time', config }).connect(h)
  const socket = FakeSocket.last!
  socket.open()
  return { h, socket, connection: await connecting }
}

const jsonSent = (socket: FakeSocket) => socket.sent.filter((d): d is string => typeof d === 'string').map(d => JSON.parse(d))

afterEach(() => { vi.unstubAllGlobals() })

describe('Inworld behind the speech-to-text port', () => {
  it('opens on the single-use token as its sub-protocol, never in the address, and sends its settings first', async () => {
    const { socket } = await connected({ modelId: 'inworld/inworld-stt-1' })
    expect(socket.url).toBe(INWORLD_STT_URL)
    expect(socket.url).not.toContain('one-time')
    expect(socket.protocols).toEqual(['bearer_one-time'])
    expect(jsonSent(socket)[0]).toEqual(transcribeConfig({ modelId: 'inworld/inworld-stt-1' }))
    expect(jsonSent(socket)[0]).toMatchObject({
      audioProtocol: 'BINARY',
      transcribeConfig: { modelId: 'inworld/inworld-stt-1', audioEncoding: 'LINEAR16', sampleRateHertz: 16_000, numberOfChannels: 1, includeWordTimestamps: true },
    })
  })

  it('offers no vocabulary boosting: a list sent in the config is not passed on', () => {
    const sent = transcribeConfig({ prompts: ['Postgres'], keyterms_prompt: ['Postgres'], modelId: 'inworld/inworld-stt-1' } as never)
    expect(JSON.stringify(sent)).not.toContain('Postgres')
    expect(sent.transcribeConfig).not.toHaveProperty('prompts')
  })

  it('numbers the turns itself, so each recorded turn commits under its own number', async () => {
    const { h, socket } = await connected()
    socket.hear(SHORT_ANSWERS)
    const committed = h.onWords.mock.calls.filter(c => c[2] === true)
    expect(committed.map(c => c[0])).toEqual(SHORT_ANSWERS_TURNS)
    expect(committed.map(c => c[3])).toEqual([0, 1, 2, 3, 4, 5])
    // Every interim carries the number of the turn it belongs to.
    expect(h.onWords.mock.calls.filter(c => c[2] === false).map(c => c[3])).toEqual([0, 0, 1, 2, 2, 3, 4, 4, 5])
  })

  it('gives the reconciler every recorded turn, where unnumbered turns would stop after the first', async () => {
    const { h, socket } = await connected()
    socket.hear(SHORT_ANSWERS)
    let state: ReconcilerState = NO_WORDS
    const out: string[] = []
    for (const [text, words, committed, turn] of h.onWords.mock.calls) {
      const step = heard(state, 1, { text, words: words.map((w: { text: string; start: number; end: number }) => ({ text: w.text, startAt: w.start, endAt: w.end })), committed, turn })
      state = step.state
      out.push(...step.emit.filter(e => e.committed).map(e => e.text))
    }
    expect(out).toEqual(SHORT_ANSWERS_TURNS)

    let unnumbered: ReconcilerState = NO_WORDS
    const lost: string[] = []
    for (const [text, , committed] of h.onWords.mock.calls) {
      const step = heard(unnumbered, 1, { text, words: [], committed, turn: null })
      unnumbered = step.state
      lost.push(...step.emit.filter(e => e.committed).map(e => e.text))
    }
    expect(lost).toEqual(SHORT_ANSWERS_TURNS.slice(0, 1))
  })

  it('reads word times in ms of audio sent, on finals and on the settled words of an interim', () => {
    expect(readInworldMessage(TIMED_FINAL)).toEqual({
      kind: 'words', final: true, text: 'Send me the test results.',
      words: [
        { text: 'Send', start: 726774, end: 727074 }, { text: 'me', start: 727074, end: 727174 }, { text: 'the', start: 727174, end: 727274 },
        { text: 'test', start: 727274, end: 727564 }, { text: 'results', start: 727594, end: 728224 },
      ],
    })
    expect(readInworldMessage(TIMED_PARTIAL)).toMatchObject({ final: false, text: 'The deploy finished at ten past nine.', words: [{ text: 'The' }, { text: 'deploy' }] })
    expect(readInworldMessage('not json')).toBeNull()
  })

  it('ends a turn when voice asks, after the audio it holds, and closes the stream when closed', async () => {
    const { socket, connection } = await connected()
    connection.send(new Int16Array(512))
    connection.endTurn()
    expect((socket.sent.at(-2) as Int16Array).length).toBe(512)
    expect(socket.sent.at(-1)).toBe(JSON.stringify({ endTurn: {} }))
    connection.close()
    expect(socket.sent.at(-1)).toBe(JSON.stringify({ closeStream: {} }))
    expect(socket.readyState).toBe(3)
  })

  it('takes Inworld’s own cut at 30 s as one more turn, and goes on under the next number', async () => {
    const { h, socket } = await connected()
    socket.hear(CUT_AT_THIRTY_SECONDS)
    expect(h.onWords.mock.calls.map(c => [c[2], c[3]])).toEqual([[false, 0], [true, 0], [false, 1]])
    expect(h.onWords.mock.calls[1]![1]).toEqual([{ text: 'If', start: 10494, end: 10684 }, { text: 'to', start: 40494, end: 40494 }])
  })

  it('ends a long turn itself at the first pause past the soft cap, so it is cut between words', async () => {
    const { socket, connection } = await connected()
    const endTurns = () => jsonSent(socket).filter(m => 'endTurn' in m).length
    socket.hear([partial('I want to walk through the whole plan')])
    // Audio of the turn sent, in 100 ms messages, up to just under the soft cap: a pause there ends nothing.
    for (let ms = 0; ms < TURN_CAP_SOFT_MS - 100; ms += 100) connection.send(new Int16Array(1600))
    socket.hear([PAUSE])
    expect(endTurns()).toBe(0)
    connection.send(new Int16Array(1600))
    connection.send(new Int16Array(1600))
    socket.hear([partial('I want to walk through the whole plan and then')])
    socket.hear([PAUSE, PAUSE])
    expect(endTurns()).toBe(1)
    // The next turn starts its own count.
    socket.hear([final('I want to walk through the whole plan and then the dates.'), partial('Next')])
    for (let ms = 0; ms < 1_000; ms += 100) connection.send(new Int16Array(1600))
    socket.hear([PAUSE])
    expect(endTurns()).toBe(1)
  })

  it('passes on an error frame, such as a token already used, and a close it was not asked for', async () => {
    const { h, socket } = await connected()
    socket.hear([ERROR_TOKEN_USED])
    socket.onclose?.()
    expect(h.onError).toHaveBeenCalledWith('invalid JWT token: token already used')
    expect(h.onClose).toHaveBeenCalledTimes(1)
  })

  it('commits an empty final over words already shown, and skips one with nothing shown', async () => {
    const { h, socket } = await connected()
    socket.hear([final(''), partial('um'), final('')])
    expect(h.onWords.mock.calls.map(c => [c[0], c[2], c[3]])).toEqual([['um', false, 1], ['', true, 1]])
  })
})

describe('the speech service a token is for', () => {
  it('is Inworld’s adapter for an Inworld token and AssemblyAI’s otherwise', () => {
    vi.stubGlobal('WebSocket', FakeSocket)
    void speechService({ provider: 'inworld', token: 'iw' }).connect(handlers())
    expect(FakeSocket.last!.url).toBe(INWORLD_STT_URL)
    void speechService({ provider: 'assemblyai', token: 'aai' }).connect(handlers())
    expect(FakeSocket.last!.url).toContain('streaming.assemblyai.com')
    expect(FakeSocket.last!.url).toContain('speech_model=universal-3-6-pro')
    void speechService({ token: 'old' }).connect(handlers())
    expect(FakeSocket.last!.url).toContain('streaming.assemblyai.com')
  })
})
