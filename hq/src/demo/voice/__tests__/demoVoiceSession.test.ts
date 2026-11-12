/**
 * The demo's voice call (live demo spec, *Voice is in, as a demo voice*): no microphone, nothing sent to hq's voice
 * service, the agent's first line first, a tapped line sent as the person's message and the agent's reply played
 * from its clip while its text streams into the thread.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CONVERSATION_SOCKET } from '../../../shared/conversations/protocol'
import { createDemoVoiceSession, type DemoVoiceDeps } from '../demoVoiceSession'

type Handler = (e: unknown) => void

const clock = { t: 0 }
afterEach(() => { vi.useRealTimers(); clock.t = 0 })

function rig(over: Partial<DemoVoiceDeps> = {}) {
  const handlers = new Map<string, Handler>()
  const emitted: unknown[][] = []
  const plays: { clip: string; finish: () => void; stopped: boolean; muted: boolean; length: (s: number | null) => void }[] = []
  const sent: unknown[] = []
  const deps: DemoVoiceDeps = {
    socket: {
      on: (event, handler) => { handlers.set(event, handler as unknown as Handler) },
      off: (event) => { handlers.delete(event) },
      emit: (...args) => { emitted.push(args) },
    },
    sendMessage: async (args) => { sent.push(args) },
    playClip: (clip) => {
      let finish!: () => void
      const ended = new Promise<void>(r => { finish = r })
      let length!: (s: number | null) => void
      const duration = new Promise<number | null>(r => { length = r })
      const play = { clip, finish, stopped: false, muted: false, length }
      plays.push(play)
      return { ended, duration, stop: () => { play.stopped = true; finish() }, mute: (m) => { play.muted = m } }
    },
    firstLine: () => ({ text: 'Hello, I am Writer. This is a demo voice.', clip: 'writer-first.mp3' }),
    newId: () => 'id1',
    now: () => clock.t,
    ...over,
  }
  const session = createDemoVoiceSession(deps)
  const room = (event: string, payload: unknown) => handlers.get(event)?.(payload)
  const tick = () => new Promise(r => setTimeout(r, 0))
  return { session, emitted, plays, sent, room, tick, handlers }
}

const agent = { id: 'a1', handle: 'writer', name: 'Writer', avatarUrl: null }
const noFirstLine = { firstLine: () => null }

describe('starting the demo voice @SC-1961', () => {
  it('opens on the call at once, asks for no microphone and tells hq nothing', () => {
    const { session, emitted } = rig()
    session.start('c1', agent, '/chat/c/c1')
    expect(session.snapshot()).toMatchObject({ conversationId: 'c1', phase: 'speaking', returnTo: '/chat/c/c1' })
    expect(emitted).toEqual([])
  })

  it('speaks the agent’s first line first, then listens', async () => {
    const { session, plays, tick } = rig()
    session.start('c1', agent, '/x')
    expect(plays.map(p => p.clip)).toEqual(['writer-first.mp3'])
    plays[0]!.finish()
    await tick()
    expect(session.snapshot().phase).toBe('listening')
  })

  it('listens straight away when the first line has no clip', () => {
    const { session, plays } = rig({ firstLine: () => ({ text: 'Hello', clip: null }) })
    session.start('c1', agent, '/x')
    expect(plays).toEqual([])
    expect(session.snapshot().phase).toBe('listening')
  })
})

describe('tapping a line @SC-1962', () => {
  const line = { text: 'What can you do?', clip: 'writer-what-can-you-do.mp3' }

  it('sends it as the person’s message, with the agent thinking', () => {
    const { session, sent } = rig(noFirstLine)
    session.start('c1', agent, '/x')
    session.say(line)
    expect(sent).toEqual([{ conversationId: 'c1', clientMessageId: 'id1', text: 'What can you do?' }])
    expect(session.snapshot().phase).toBe('thinking')
  })

  it('plays the reply’s clip when its text starts to stream, and listens again when it ends', async () => {
    const { session, plays, room, tick } = rig(noFirstLine)
    session.start('c1', agent, '/x')
    session.say(line)
    room(CONVERSATION_SOCKET.delta, { conversationId: 'c1', turnId: 't1', text: 'I' })
    expect(plays.map(p => p.clip)).toEqual(['writer-what-can-you-do.mp3'])
    expect(session.snapshot().phase).toBe('speaking')
    room(CONVERSATION_SOCKET.delta, { conversationId: 'c1', turnId: 't1', text: ' am' })
    expect(plays).toHaveLength(1)
    room(CONVERSATION_SOCKET.turn, { conversationId: 'c1', turnId: 't1', state: 'COMPLETED' })
    expect(session.snapshot().phase).toBe('speaking')
    plays[0]!.finish()
    await tick()
    expect(session.snapshot().phase).toBe('listening')
  })

  it('plays the clip at the turn’s end when no text streamed first', () => {
    const { session, plays, room } = rig(noFirstLine)
    session.start('c1', agent, '/x')
    session.say(line)
    room(CONVERSATION_SOCKET.turn, { conversationId: 'c1', turnId: 't1', state: 'RUNNING' })
    expect(plays).toEqual([])
    room(CONVERSATION_SOCKET.turn, { conversationId: 'c1', turnId: 't1', state: 'COMPLETED' })
    expect(plays.map(p => p.clip)).toEqual(['writer-what-can-you-do.mp3'])
  })

  it('shows a reply with no clip as text only, then listens', () => {
    const { session, plays, room } = rig(noFirstLine)
    session.start('c1', agent, '/x')
    session.say({ text: 'Anything', clip: null })
    room(CONVERSATION_SOCKET.delta, { conversationId: 'c1', turnId: 't1', text: 'x' })
    expect(plays).toEqual([])
    expect(session.snapshot().phase).toBe('thinking')
    room(CONVERSATION_SOCKET.turn, { conversationId: 'c1', turnId: 't1', state: 'COMPLETED' })
    expect(session.snapshot().phase).toBe('listening')
  })

  it('plays nothing when the turn failed, and listens', () => {
    const { session, plays, room } = rig(noFirstLine)
    session.start('c1', agent, '/x')
    session.say(line)
    room(CONVERSATION_SOCKET.turn, { conversationId: 'c1', turnId: 't1', state: 'FAILED' })
    expect(plays).toEqual([])
    expect(session.snapshot().phase).toBe('listening')
  })

  it('hears only its own conversation', () => {
    const { session, plays, room } = rig(noFirstLine)
    session.start('c1', agent, '/x')
    session.say(line)
    room(CONVERSATION_SOCKET.delta, { conversationId: 'other', turnId: 't1', text: 'x' })
    expect(plays).toEqual([])
  })

  it('says the words were not sent when sending fails, and listens again', async () => {
    const { session, tick } = rig({ ...noFirstLine, sendMessage: async () => { throw new Error('Too busy.') } })
    session.start('c1', agent, '/x')
    session.say(line)
    await tick()
    expect(session.snapshot()).toMatchObject({ phase: 'listening', notice: 'Your words were not sent. Too busy.', noticeFor: 'c1' })
  })

  it('a tap while the first line plays, or while a reply is on its way, is ignored', async () => {
    const { session, plays, sent, tick } = rig()
    session.start('c1', agent, '/x')
    session.say(line)
    expect(sent).toEqual([])
    plays[0]!.finish()
    await tick()
    session.say(line)
    session.say(line)
    expect(sent).toHaveLength(1)
  })
})

describe('ending and stopping @SC-1964', () => {
  it('End stops the clip and the call is off, telling hq nothing', () => {
    const { session, plays, emitted } = rig()
    session.start('c1', agent, '/x')
    session.end()
    expect(plays[0]!.stopped).toBe(true)
    expect(session.snapshot().phase).toBe('off')
    expect(emitted).toEqual([])
  })

  it('Stop cuts the clip being played and says so', () => {
    const { session, plays } = rig()
    session.start('c1', agent, '/x')
    expect(session.stopSpeaking()).toBe(true)
    expect(plays[0]!.stopped).toBe(true)
    expect(session.snapshot().phase).toBe('listening')
    expect(session.stopSpeaking()).toBe(false)
  })

  it('Mute silences the clips, and unmute brings them back', () => {
    const { session, plays } = rig()
    session.start('c1', agent, '/x')
    session.toggleMute()
    expect(session.snapshot().muted).toBe(true)
    expect(plays[0]!.muted).toBe(true)
    session.toggleMute()
    expect(plays[0]!.muted).toBe(false)
  })

  it('stops listening to the room on dispose', () => {
    const { session, handlers } = rig()
    expect(handlers.size).toBeGreaterThan(0)
    session.dispose()
    expect(handlers.size).toBe(0)
  })

  it('does nothing when the clip ends after the call did', async () => {
    const { session, plays, tick } = rig()
    session.start('c1', agent, '/x')
    session.end()
    plays[0]!.finish()
    await tick()
    expect(session.snapshot().phase).toBe('off')
  })
})

describe('the reply’s text follows its clip @SC-1962', () => {
  const line = { text: 'What can you do?', clip: 'writer-what-can-you-do.mp3' }
  const words = 'one two three four five six seven eight nine ten'

  async function start() {
    vi.useFakeTimers()
    const r = rig(noFirstLine)
    r.session.start('c1', agent, '/x')
    r.session.say(line)
    r.room(CONVERSATION_SOCKET.delta, { conversationId: 'c1', turnId: 't1', offset: 0, text: words })
    r.plays[0]!.length(10)
    await vi.advanceTimersByTimeAsync(0)
    return r
  }

  it('holds the text back until the clip’s length is known, and shows none of it at first', () => {
    vi.useFakeTimers()
    const { session, room } = rig(noFirstLine)
    session.start('c1', agent, '/x')
    session.say(line)
    room(CONVERSATION_SOCKET.delta, { conversationId: 'c1', turnId: 't1', offset: 0, text: words })
    expect(session.snapshot().reveal).toMatchObject({ turnId: 't1', head: null })
  })

  it('lays the words over the clip’s duration, the playhead moving with the clock', async () => {
    const { session } = await start()
    const first = session.snapshot().reveal!
    expect(first.sentences[0]).toMatchObject({ textStart: 0, textEnd: words.length })
    expect(first.sentences[0]!.words).toHaveLength(10)
    expect(first.sentences[0]!.wordStartSecs.at(-1)).toBeCloseTo(9)
    expect(first.head!.elapsed).toBe(0)
    clock.t = 4000
    await vi.advanceTimersByTimeAsync(100)
    expect(session.snapshot().reveal!.head!.elapsed).toBe(4)
  })

  it('shows the whole text once the clip ends', async () => {
    const { session, plays } = await start()
    plays[0]!.finish()
    await vi.advanceTimersByTimeAsync(0)
    expect(session.snapshot().reveal).toBeNull()
    expect(session.snapshot().phase).toBe('listening')
  })

  it('leaves the text as it streams when the clip’s length cannot be told', async () => {
    vi.useFakeTimers()
    const { session, room, plays } = rig(noFirstLine)
    session.start('c1', agent, '/x')
    session.say(line)
    room(CONVERSATION_SOCKET.delta, { conversationId: 'c1', turnId: 't1', offset: 0, text: words })
    plays[0]!.length(null)
    await vi.advanceTimersByTimeAsync(0)
    expect(session.snapshot().reveal).toBeNull()
  })

  it('keeps the words that arrive later, by their offset', async () => {
    const { session, room } = await start()
    room(CONVERSATION_SOCKET.delta, { conversationId: 'c1', turnId: 't1', offset: words.length, text: ' eleven' })
    await vi.advanceTimersByTimeAsync(100)
    expect(session.snapshot().reveal!.sentences[0]!.words).toHaveLength(11)
  })

  it('stops the clock when the call ends', async () => {
    const { session } = await start()
    session.end()
    expect(session.snapshot().reveal).toBeNull()
    expect(vi.getTimerCount()).toBe(0)
  })
})

describe('the lead’s own lines are spoken @SC-1963', () => {
  const message = (over: Record<string, unknown> = {}) => ({
    conversationId: 'c1',
    message: { id: 'm1', role: 'AGENT', kind: 'TEXT', turnId: 't9', body: { text: 'That work has come back: its card above shows what it did.' }, ...over },
  })
  const spokenLine = (_h: string | undefined, text: string) => (text.startsWith('That work has come back') ? 'writer-report.mp3' : null)

  it('plays the clip of a line the lead said by itself when the call is listening', () => {
    const { session, plays, room } = rig({ ...noFirstLine, spokenLine })
    session.start('c1', agent, '/x')
    room(CONVERSATION_SOCKET.message, message())
    expect(plays.map(p => p.clip)).toEqual(['writer-report.mp3'])
    expect(session.snapshot().phase).toBe('speaking')
  })

  it('plays it once, however often the message arrives', () => {
    const { session, plays, room } = rig({ ...noFirstLine, spokenLine })
    session.start('c1', agent, '/x')
    room(CONVERSATION_SOCKET.message, message())
    plays[0]!.finish()
    room(CONVERSATION_SOCKET.message, message())
    expect(plays).toHaveLength(1)
  })

  it('leaves a line with no clip as text only', () => {
    const { session, plays, room } = rig({ ...noFirstLine, spokenLine })
    session.start('c1', agent, '/x')
    room(CONVERSATION_SOCKET.message, message({ id: 'm2', body: { text: 'Something else.' } }))
    expect(plays).toEqual([])
    expect(session.snapshot().phase).toBe('listening')
  })

  it('does not speak a person’s message, or another conversation’s line', () => {
    const { session, plays, room } = rig({ ...noFirstLine, spokenLine })
    session.start('c1', agent, '/x')
    room(CONVERSATION_SOCKET.message, message({ role: 'PERSON' }))
    room(CONVERSATION_SOCKET.message, { ...message(), conversationId: 'other' })
    expect(plays).toEqual([])
  })

  it('does not talk over a reply being awaited, and says the line once the reply has been said', async () => {
    const { session, plays, room, tick } = rig({ ...noFirstLine, spokenLine })
    session.start('c1', agent, '/x')
    session.say({ text: 'What can you do?', clip: 'writer-a.mp3' })
    room(CONVERSATION_SOCKET.message, message())
    expect(plays).toEqual([])
    room(CONVERSATION_SOCKET.delta, { conversationId: 'c1', turnId: 't1', offset: 0, text: 'I write.' })
    expect(plays.map(p => p.clip)).toEqual(['writer-a.mp3'])
    plays[0]!.finish()
    await tick()
    expect(plays.map(p => p.clip)).toEqual(['writer-a.mp3', 'writer-report.mp3'])
    plays[1]!.finish()
    await tick()
    expect(session.snapshot().phase).toBe('listening')
  })

  it('a line that came while the first line played is said after it', async () => {
    const { session, plays, room, tick } = rig({ spokenLine })
    session.start('c1', agent, '/x')
    room(CONVERSATION_SOCKET.message, message())
    expect(plays.map(p => p.clip)).toEqual(['writer-first.mp3'])
    plays[0]!.finish()
    await tick()
    expect(plays.map(p => p.clip)).toEqual(['writer-first.mp3', 'writer-report.mp3'])
  })

  it('drops what was waiting to be said when the call ends', async () => {
    const { session, plays, room, tick } = rig({ spokenLine })
    session.start('c1', agent, '/x')
    room(CONVERSATION_SOCKET.message, message())
    session.end()
    await tick()
    expect(plays.map(p => p.clip)).toEqual(['writer-first.mp3'])
  })

  it('does nothing without the lines (a call outside the scripts)', () => {
    const { session, plays, room } = rig(noFirstLine)
    session.start('c1', agent, '/x')
    room(CONVERSATION_SOCKET.message, message())
    expect(plays).toEqual([])
  })
})
