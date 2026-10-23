import { afterEach, describe, expect, it, vi } from 'vitest'
import { CONVERSATION_SOCKET, CONVERSATION_VOICE_SOCKET as V } from '../../../shared/conversations/protocol'
import { script } from '../stt/__tests__/transcribing'
import { C, ME, rig } from './sessionRig'

afterEach(() => { vi.useRealTimers() })

describe('starting and ending voice @SC-995', () => {
  it('asks hq for voice, and opens the microphone only once hq says this browser holds it', async () => {
    const open = vi.fn(async () => ({ stop: () => undefined, settings: () => ({}), contextRate: 16_000 }))
    const r = rig({ deps: { openMicrophone: open } })
    r.session.start(C, { name: 'Kernel', avatarUrl: null }, '/chat/c1')
    expect(r.emitted).toEqual([[V.start, { conversationId: C }]])
    expect(r.session.snapshot().phase).toBe('starting')
    expect(open).not.toHaveBeenCalled()
    r.receive(V.state, { conversationId: C, holderId: ME, startedAt: 'now' })
    await r.advance(50)
    expect(open).toHaveBeenCalledTimes(1)
    expect(r.session.snapshot().phase).toBe('listening')
  })

  it('fetches the speech token as voice is asked for, and the speech connection uses it', async () => {
    const getToken = vi.fn(async () => ({ token: 't' }))
    const r = rig({ deps: { getToken } })
    r.session.start(C, null, '/chat/c1')
    expect(getToken).toHaveBeenCalledTimes(1)
    r.receive(V.state, { conversationId: C, holderId: ME, startedAt: 'now' })
    await r.advance(50)
    // The one fetched ahead, then one kept ready for the next connection.
    expect(getToken).toHaveBeenCalledTimes(2)
    expect(r.fake.connections()).toBe(1)
  })

  it('keeps a token fetched ahead of voice for a few minutes, and fetches again after', () => {
    const getToken = vi.fn(async () => ({ token: 't' }))
    const r = rig({ deps: { getToken } })
    r.session.prepare()
    r.session.prepare()
    expect(getToken).toHaveBeenCalledTimes(1)
    r.clock.advance(6 * 60_000)
    r.session.prepare()
    expect(getToken).toHaveBeenCalledTimes(2)
  })

  it('shows hq’s reason when voice is in use by someone else, and never opens the microphone', () => {
    const open = vi.fn()
    const r = rig({ deps: { openMicrophone: open } })
    r.session.start(C, null, '/chat/c1')
    r.receive(V.error, { conversationId: C, message: 'Someone else is using voice here.' })
    expect(r.session.snapshot()).toMatchObject({ phase: 'off', notice: 'Someone else is using voice here.' })
    expect(open).not.toHaveBeenCalled()
  })

  it('ends on End: tells hq, closes the microphone and the speech connection', async () => {
    const stop = vi.fn()
    const r = rig({ deps: { openMicrophone: async () => ({ stop, settings: () => ({}), contextRate: 16_000 }) } })
    await r.start()
    r.session.end()
    expect(r.emitted.at(-1)).toEqual([V.end, { conversationId: C }])
    expect(stop).toHaveBeenCalled()
    expect(r.session.snapshot().phase).toBe('off')
    expect(r.session.runtime()).toBeNull()
  })

  it('ends when hq ends it, with hq’s line', async () => {
    const r = rig()
    await r.start()
    r.receive(V.ended, { conversationId: C, reason: 'Voice ended after two quiet minutes.' })
    expect(r.session.snapshot()).toMatchObject({ phase: 'off', notice: 'Voice ended after two quiet minutes.' })
  })

  it('ends with one line when the microphone cannot be used, and tells hq', async () => {
    const r = rig({ deps: { openMicrophone: async () => { throw new Error('The microphone could not be used.') } } })
    r.session.start(C, null, '/chat/c1')
    r.receive(V.state, { conversationId: C, holderId: ME, startedAt: 'now' })
    await r.advance(50)
    expect(r.session.snapshot()).toMatchObject({ phase: 'off', notice: 'The microphone could not be used.' })
    expect(r.emitted.at(-1)).toEqual([V.end, { conversationId: C }])
  })

  it('ends with a line when the speech service cannot be reached, and the conversation goes on typed', async () => {
    const r = rig({ deps: { getToken: () => Promise.reject(new Error('no token')) } })
    r.session.start(C, null, '/chat/c1')
    r.receive(V.state, { conversationId: C, holderId: ME, startedAt: 'now' })
    await r.advance(3_000)
    expect(r.session.snapshot().phase).toBe('off')
    expect(r.session.snapshot().notice).toBe('Voice stopped: no token. You can keep typing.')
    expect(r.emitted.at(-1)).toEqual([V.end, { conversationId: C, failed: 'speech-to-text' }])
  })

  it('asks for the agent’s own speech to text token', async () => {
    const getToken = vi.fn(async (_agentId?: string) => ({ token: 't' }))
    const r = rig({ deps: { getToken } })
    r.session.start(C, { id: 'a1', name: 'Kernel', avatarUrl: null }, '/chat/c1')
    expect(getToken).toHaveBeenCalledWith('a1', C)
  })

  it('tells hq when the tab closes', async () => {
    const r = rig()
    await r.start()
    r.session.closing()
    expect(r.emitted.at(-1)).toEqual([V.end, { conversationId: C }])
  })

  it('is there for the voice lab while voice is on, and gone when it ends', async () => {
    const r = rig()
    expect(r.session.runtime()).toBeNull()
    await r.start()
    expect(r.session.runtime()).not.toBeNull()
    await r.silence(100)
    expect(r.of('audio.frame').every(f => f.pcm.length === 512)).toBe(true)
    r.session.end()
    expect(r.session.runtime()).toBeNull()
  })
})

describe('what the person says @SC-995', () => {
  it('shows the words as they are said, and sends them, marked spoken, when the turn is decided', async () => {
    const r = rig()
    await r.start()
    await r.hear(script([[4, 0]], 8, 300).audio)
    await r.silence(400)
    expect(r.session.snapshot().partial).toBe('w0 w1 w2 w3')
    await r.silence(800)
    expect(r.sendMessage).toHaveBeenCalledWith({ conversationId: C, clientMessageId: 'm0', text: 'w0 w1 w2 w3', spoken: true })
    expect(r.session.snapshot()).toMatchObject({ partial: '', phase: 'thinking' })
  })

  it('sends what was being said when the person ends voice', async () => {
    const r = rig({ turnScores: [0.01] })
    await r.start()
    await r.hear(script([[3, 0]], 8, 300).audio)
    await r.silence(400)
    expect(r.sent()).toEqual([])
    r.session.end()
    expect(r.sent()).toEqual(['w0 w1 w2'])
  })

  it('says so when a spoken message was refused', async () => {
    const r = rig()
    r.sendMessage.mockRejectedValueOnce(new Error('This conversation is closed.'))
    await r.start()
    await r.hear(script([[2, 0]], 8, 300).audio)
    await r.silence(1_200)
    expect(r.session.snapshot().notice).toContain('This conversation is closed.')
  })

  it('tells hq now and then that the person is speaking, not at every word', async () => {
    const r = rig()
    await r.start()
    await r.clock.advance(6_000)
    await r.hear(script([[4, 0]], 8, 0).audio)
    expect(r.emitted.filter(e => e[0] === V.activity)).toHaveLength(1)
  })

  it('hears nothing while muted, and shows it', async () => {
    const r = rig()
    await r.start()
    r.session.toggleMute()
    expect(r.session.snapshot().muted).toBe(true)
    await r.hear(script([[4, 0]], 8, 300).audio)
    await r.silence(3_500)
    expect(r.of('stt.words')).toEqual([])
    expect(r.sent()).toEqual([])
  })

  it('shows the silence warning until the person speaks', async () => {
    const r = rig()
    await r.start()
    r.receive(V.silenceWarning, { conversationId: C, endsInMs: 15000 })
    expect(r.session.snapshot().warningEndsAt).not.toBeNull()
    await r.hear(script([[3, 0]], 8, 0).audio)
    expect(r.session.snapshot().warningEndsAt).toBeNull()
  })
})

describe('the reply, held back to the voice @SC-995', () => {
  it('holds a reply from its first text, so none shows ahead of the audio', async () => {
    const r = rig()
    await r.start()
    r.receive(CONVERSATION_SOCKET.delta, { conversationId: C, turnId: 't1', offset: 0, text: 'Hello' })
    expect(r.session.snapshot().reveal).toEqual({ turnId: 't1', head: null, sentences: [] })
  })

  it('lets a reply with no speech show after a while, or once hq says none of it was spoken; not when its turn ends', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const r = rig()
    await r.start()
    r.receive(CONVERSATION_SOCKET.delta, { conversationId: C, turnId: 't1', offset: 0, text: 'Hello' })
    vi.advanceTimersByTime(13_000)
    expect(r.session.snapshot().reveal).toBeNull()
    r.receive(CONVERSATION_SOCKET.delta, { conversationId: C, turnId: 't2', offset: 0, text: 'Again' })
    r.receive(CONVERSATION_SOCKET.turn, { conversationId: C, turnId: 't2', state: 'COMPLETED' })
    expect(r.session.snapshot().reveal).toMatchObject({ turnId: 't2' })
    r.replyEnds('t2', 0)
    expect(r.session.snapshot().reveal).toBeNull()
  })

  it('follows the playhead while a sentence is heard, and shows it whole when the audio is done', async () => {
    const r = rig()
    await r.start()
    r.reply('t1', ['Hello there.'])
    expect(r.pb.state.enqueued).toEqual([0])
    r.pb.state.head = { index: 0, elapsed: 0.2, ended: false }
    await r.advance(60)
    expect(r.session.snapshot()).toMatchObject({ phase: 'speaking', reveal: { head: { index: 0, elapsed: 0.2, ended: false } } })
    r.receive(CONVERSATION_SOCKET.turn, { conversationId: C, turnId: 't1', state: 'COMPLETED' })
    expect(r.session.snapshot().reveal).not.toBeNull()
    r.replyEnds('t1', 1)
    await r.advance(60)
    expect(r.session.snapshot()).toMatchObject({ reveal: null, phase: 'listening' })
  })

  it('stops the reply on the stop button, and tells hq what was heard', async () => {
    const r = rig()
    await r.start()
    r.reply('t1', ['Hello there.', 'And more.'])
    await r.advance(60)
    r.pb.state.heard = 0
    expect(r.session.stopSpeaking()).toBe(true)
    expect(r.pb.state.stopped).toBe(1)
    expect(r.interrupts()).toEqual([[V.interrupt, { conversationId: C, turnId: 't1', heardThrough: 0 }]])
    expect(r.session.snapshot().phase).toBe('listening')
    expect(r.session.stopSpeaking()).toBe(false)
  })

  it('shows the reply as written, with the reason, when speech fails in the middle', async () => {
    const r = rig()
    await r.start()
    r.reply('t1', ['Hello there.'])
    r.receive(V.error, { conversationId: C, message: 'The voice stopped; the rest is text.' })
    expect(r.session.snapshot()).toMatchObject({ reveal: null, notice: 'The voice stopped; the rest is text.', phase: 'listening' })
  })

  it('counts the outstanding work for the bar on other pages', async () => {
    const r = rig()
    await r.start()
    r.receive(CONVERSATION_SOCKET.operation, { conversationId: C, operationId: 'o', state: 'RUNNING', title: 'x', outstanding: 2 })
    expect(r.session.snapshot().outstanding).toBe(2)
  })

  it('ignores another conversation’s events', async () => {
    const r = rig()
    await r.start()
    r.receive(V.sentence, { conversationId: 'other', turnId: 't1', index: 0, text: 'x', textStart: 0, textEnd: 1, words: [], wordStartSecs: [], wordEndSecs: [] })
    expect(r.session.snapshot().reveal).toBeNull()
  })
})
