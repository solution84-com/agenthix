import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SpeechToTextHandlers } from '../../ports'
import { assemblyAi, gatherAudio, readSpeechMessage } from '../assemblyAi'

class FakeSocket {
  static OPEN = 1
  static last: FakeSocket | null = null
  readyState = 0
  bufferedAmount = 0
  sent: unknown[] = []
  onopen: (() => void) | null = null
  onmessage: ((e: { data: string }) => void) | null = null
  onclose: (() => void) | null = null
  constructor(public url: string) { FakeSocket.last = this }
  send(data: unknown) { this.sent.push(data) }
  close() { this.readyState = 3 }
}

function handlers() {
  return { onWords: vi.fn(), onClose: vi.fn(), onError: vi.fn() } satisfies SpeechToTextHandlers
}

afterEach(() => { vi.unstubAllGlobals() })

describe('AssemblyAI behind the speech-to-text port @SC-995', () => {
  it('opens a socket on the token with its settings, and gives the connection once it is open', async () => {
    vi.stubGlobal('WebSocket', FakeSocket)
    const onOpen = vi.fn()
    const connecting = assemblyAi({ token: 'tok', config: { max_turn_silence: 1000 }, onOpen }).connect(handlers())
    const socket = FakeSocket.last!
    expect(socket.url).toContain('token=tok')
    expect(socket.url).toContain('max_turn_silence=1000')
    socket.readyState = 1
    socket.onopen?.()
    expect(onOpen).toHaveBeenCalledTimes(1)
    const connection = await connecting
    connection.send(new Int16Array(1600))
    socket.bufferedAmount = 64_000
    expect(connection.bufferedMs()).toBe(2_000)
    connection.send(new Int16Array(512))
    expect(connection.bufferedMs()).toBe(2_032)
    connection.endTurn()
    expect((socket.sent.at(-2) as Int16Array).length).toBe(512)
    expect(socket.sent.at(-1)).toBe(JSON.stringify({ type: 'ForceEndpoint' }))
    connection.close()
    expect(socket.sent.at(-1)).toBe(JSON.stringify({ type: 'Terminate' }))
    expect(socket.readyState).toBe(3)
  })

  it('hands on words as they are written and when the turn ends, errors, and a close it was not asked for', () => {
    vi.stubGlobal('WebSocket', FakeSocket)
    const h = handlers()
    void assemblyAi({ token: 't' }).connect(h)
    const socket = FakeSocket.last!
    const words = [{ text: 'hi', start: 10, end: 90 }]
    socket.onmessage?.({ data: JSON.stringify({ type: 'Turn', transcript: 'hi', end_of_turn: false, turn_order: 2, words }) })
    socket.onmessage?.({ data: JSON.stringify({ type: 'Turn', transcript: 'Hi.', end_of_turn: true, turn_is_formatted: true, turn_order: 2, words }) })
    socket.onmessage?.({ data: JSON.stringify({ type: 'Error', error: 'quota' }) })
    socket.onclose?.()
    expect(h.onWords.mock.calls).toEqual([['hi', words, false, 2], ['Hi.', words, true, 2]])
    expect(h.onError).toHaveBeenCalledWith('quota')
    expect(h.onClose).toHaveBeenCalledTimes(1)
  })

  it('says nothing more once closed, even through a handler kept from before', async () => {
    vi.stubGlobal('WebSocket', FakeSocket)
    const h = handlers()
    const connecting = assemblyAi({ token: 't' }).connect(h)
    const socket = FakeSocket.last!
    socket.readyState = 1
    socket.onopen?.()
    const kept = socket.onmessage
    ;(await connecting).close()
    kept?.({ data: JSON.stringify({ type: 'Turn', transcript: 'late', end_of_turn: false }) })
    expect(h.onWords).not.toHaveBeenCalled()
  })
})

describe('the audio sent', () => {
  it('goes in messages of at least 100 ms, the microphone\'s frames joined in order', () => {
    const sent: Int16Array[] = []
    const audio = gatherAudio(100, pcm => sent.push(pcm))
    for (let i = 0; i < 7; i++) audio.add(new Int16Array(512).fill(i))
    expect(sent.map(m => m.length)).toEqual([2048])
    expect([...new Set(sent[0])]).toEqual([0, 1, 2, 3])
    expect(audio.heldMs()).toBe(96)
    audio.flush()
    expect(sent.map(m => m.length)).toEqual([2048, 1536])
  })
})

describe('what the service heard @SC-995', () => {
  it('shows the word still being heard in a turn in progress, which the transcript leaves out', () => {
    const msg = readSpeechMessage(JSON.stringify({
      type: 'Turn', transcript: 'over the', end_of_turn: false, turn_order: 1,
      words: [{ text: 'over', start: 0, end: 80 }, { text: 'the', start: 300, end: 380 }, { text: 'dog', start: 460, end: 540 }],
    }))
    expect(msg).toMatchObject({ kind: 'partial', text: 'over the dog' })
  })
})
