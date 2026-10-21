import { afterEach, describe, expect, it, vi } from 'vitest'
import { createSpeechInput } from '../speechInput'

class FakeSocket {
  static OPEN = 1
  static last: FakeSocket | null = null
  readyState = 0
  bufferedAmount = 0
  sent: unknown[] = []
  url: string
  onopen: (() => void) | null = null
  onmessage: ((e: { data: string }) => void) | null = null
  onclose: (() => void) | null = null
  constructor(url: string) { this.url = url; FakeSocket.last = this }
  send(data: unknown) { this.sent.push(data) }
  close() { this.readyState = 3 }
  open() { this.readyState = 1; this.onopen?.() }
}

let port: { onmessage: ((e: { data: ArrayBuffer }) => void) | null }

function stubBrowser(contextRate = 16000) {
  FakeSocket.last = null
  port = { onmessage: null }
  vi.stubGlobal('WebSocket', FakeSocket)
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: async () => ({ getTracks: () => [] }) } })
  vi.stubGlobal('AudioContext', class {
    sampleRate = contextRate
    destination = {}
    audioWorklet = { addModule: async () => undefined }
    createMediaStreamSource() { return { connect: () => undefined } }
    close() { return Promise.resolve() }
  })
  vi.stubGlobal('AudioWorkletNode', class { port = port; connect() {} disconnect() {} })
}

/** 100 ms of 16 kHz audio, the size the input sends at once. */
const speak = () => port.onmessage?.({ data: new Float32Array(1600).fill(0.1).buffer })

function make(getToken: () => Promise<{ token: string }>) {
  return createSpeechInput({
    getToken, onPartial: () => undefined, onTurn: () => undefined,
    onFail: () => undefined, config: { max_turn_silence: 1000 },
  })
}

afterEach(() => { vi.unstubAllGlobals() })

describe('speech input and its socket @SC-998', () => {
  it('holds what is heard before the socket opens and sends it, in order, once it opens', async () => {
    stubBrowser()
    let giveToken: (t: { token: string }) => void = () => undefined
    const input = make(() => new Promise(r => { giveToken = r }))
    const started = input.start()
    await vi.waitFor(() => expect(port.onmessage).not.toBeNull())
    speak(); speak(); speak()
    giveToken({ token: 't' })
    await started
    const socket = FakeSocket.last!
    expect(socket.sent).toHaveLength(0)
    socket.open()
    expect(socket.sent).toHaveLength(3)
    speak()
    expect(socket.sent).toHaveLength(4)
    input.stop()
  })

  it('asks for the token before the microphone is open', async () => {
    stubBrowser()
    const getToken = vi.fn(async () => ({ token: 't' }))
    const input = make(getToken)
    const started = input.start()
    expect(getToken).toHaveBeenCalledTimes(1)
    await started
    expect(getToken).toHaveBeenCalledTimes(1)
    input.stop()
  })

  it('puts its own settings over the organisation’s', async () => {
    stubBrowser()
    const input = make(async () => ({ token: 't', config: { max_turn_silence: 2500 } } as { token: string }))
    await input.start()
    expect(FakeSocket.last!.url).toContain('max_turn_silence=1000')
    input.stop()
  })

  it('ends the turn on request, sending what it still holds first', async () => {
    stubBrowser()
    const input = make(async () => ({ token: 't' }))
    await input.start()
    const socket = FakeSocket.last!
    socket.open()
    port.onmessage?.({ data: new Float32Array(400).fill(0.1).buffer })
    input.endTurn()
    expect(socket.sent).toHaveLength(2)
    expect(socket.sent[1]).toBe(JSON.stringify({ type: 'ForceEndpoint' }))
  })

  it('tells the service it is done before closing', async () => {
    stubBrowser()
    const input = make(async () => ({ token: 't' }))
    await input.start()
    const socket = FakeSocket.last!
    socket.open()
    input.stop()
    expect(socket.sent.at(-1)).toBe(JSON.stringify({ type: 'Terminate' }))
    expect(socket.readyState).toBe(3)
  })

  it('sends 16 kHz audio, as the service is told, when the context runs at the device’s 48 kHz', async () => {
    stubBrowser(48000)
    const input = make(async () => ({ token: 't' }))
    await input.start()
    const socket = FakeSocket.last!
    socket.open()
    expect(socket.url).toContain('sample_rate=16000')
    // One second at 48 kHz, as the worklet posts it: 128 frames at a time.
    for (let i = 0; i < 48000 / 128; i++) port.onmessage?.({ data: new Float32Array(128).fill(0.1).buffer })
    const samples = (socket.sent as Int16Array[]).reduce((n, c) => n + c.length, 0)
    expect(socket.sent.length).toBeGreaterThanOrEqual(9)
    expect(samples).toBeGreaterThan(14_000)
    expect(samples).toBeLessThanOrEqual(16_000)
    input.stop()
  })

  it('times each word heard by when its audio was captured, held audio included', async () => {
    stubBrowser()
    let clock = 1000
    const onPartial = vi.fn()
    const input = createSpeechInput({
      getToken: async () => ({ token: 't' }), onPartial, onTurn: () => undefined, onFail: () => undefined, now: () => clock,
    })
    await input.start()
    speak()
    clock = 1100
    const socket = FakeSocket.last!
    socket.open()
    speak()
    socket.onmessage?.({ data: JSON.stringify({ type: 'Turn', transcript: 'one two', end_of_turn: false, turn_order: 0,
      words: [{ text: 'one', start: 50, end: 90 }, { text: 'two', start: 150, end: 190 }] }) })
    // The first 100 ms were captured by 1000 (held until the socket opened), the next by 1100.
    expect(onPartial).toHaveBeenCalledWith('one two', 0, [{ text: 'one', at: 950, endAt: 990 }, { text: 'two', at: 1050, endAt: 1090 }])
    input.stop()
  })
})

describe('a socket the service closes @SC-998', () => {
  it('is opened again on the token fetched ahead, and its turns are numbered apart from the old one’s', async () => {
    stubBrowser()
    let n = 0
    const tokens: string[] = []
    const onPartial = vi.fn()
    const input = createSpeechInput({
      getToken: async () => { const t = `t${n++}`; tokens.push(t); return { token: t } },
      onPartial, onTurn: () => undefined, onFail: () => undefined,
    })
    await input.start()
    const first = FakeSocket.last!
    first.open()
    // The next socket's token was fetched when this one opened.
    expect(tokens).toEqual(['t0', 't1'])
    first.onclose?.()
    await vi.waitFor(() => expect(FakeSocket.last).not.toBe(first), { timeout: 2_000 })
    const next = FakeSocket.last!
    expect(next.url).toContain('token=t1')
    next.open()
    next.onmessage?.({ data: JSON.stringify({ type: 'Turn', transcript: 'again', end_of_turn: false, turn_order: 0, words: [] }) })
    expect(onPartial).toHaveBeenCalledWith('again', 1000, [])
    input.stop()
  })
})
