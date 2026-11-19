/**
 * A line the browser skipped is not stored as heard (adaptive voice listening, spec §What is stored): taken out of the
 * turn's lines while they wait, or out of the agent message already stored — the heard lines a reply starts with, or a
 * turn the light model closed alone — when that message still reads as it was written.
 */
import { describe, expect, it, vi } from 'vitest'
import type { TurnSpeech } from '../../session'
import { withHeardLines } from '../heard'
import type { ListeningSession } from '../listen'
import { listeningOf } from '../state'
import { createUnheard, type RewriteTarget } from '../unheard'
import { json, rig } from './listenRig'

const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve() }

function speech(): TurnSpeech {
  return { text: vi.fn(), end: vi.fn((_s, full: string) => ({ text: full, interrupted: false })), written: vi.fn(), hold: vi.fn() }
}

/** Stored agent messages by message id, or by turn for a turn closed alone; each rewrite recorded. */
function store(messages = new Map<string, string>()) {
  const rewrites: RewriteTarget[] = []
  const timers: (() => void)[] = []
  const unheard = createUnheard({
    async rewrite(_s, target, edit) {
      rewrites.push(target)
      const key = target.messageId ?? target.turnId
      const text = messages.get(key)
      if (text === undefined) return false
      const next = edit(text)
      if (next === null) return false
      messages.set(key, next)
      return true
    },
    later: (_ms, fn) => { timers.push(fn); return () => undefined },
    log: () => undefined,
  })
  return { messages, rewrites, timers, unheard }
}

const session = (): ListeningSession => ({ conversationId: 'c1', holderId: 'u1' })

/** A reply under the light model, its lines heard before it, ended and (unless `written` is false) written. */
function reply(s: ListeningSession, lines: string[], text: string, written = true) {
  const state = listeningOf(s)
  lines.forEach((l, i) => state.sent(`L${i + 1}`, l))
  const turn = withHeardLines(speech(), 't1', state, vi.fn())
  const stored = turn.end('COMPLETED', text).text
  if (written) turn.written('msg-1')
  return { state, turn, stored }
}

describe('a line the browser skipped @SC-2216', () => {
  it('is taken out of the lines waiting for the reply, and nothing stored is touched', async () => {
    const s = session()
    const state = listeningOf(s)
    state.sent('L1', 'Mm-hm.')
    state.sent('L2', 'Let me look.')
    const st = store()
    await st.unheard.skipped(s, 'L1')
    expect(state.takeLines()).toEqual(['Let me look.'])
    expect(st.rewrites).toEqual([])
  })

  it('is taken out of a stored reply\'s heard lines; the reply stays, and a later cut reads the new prefix', async () => {
    const s = session()
    const { state, stored } = reply(s, ['Mm-hm.', 'Let me look.'], 'It is sunny.')
    expect(stored).toBe('Mm-hm. Let me look.\n\nIt is sunny.')
    const st = store(new Map([['msg-1', stored]]))
    await st.unheard.skipped(s, 'L1')
    expect(st.rewrites).toEqual([{ turnId: 't1', messageId: 'msg-1' }])
    expect(st.messages.get('msg-1')).toBe('Let me look.\n\nIt is sunny.')
    expect(state.prefixOf('t1')).toBe('Let me look.')
    await st.unheard.skipped(s, 'L2')
    expect(st.messages.get('msg-1')).toBe('It is sunny.')
    expect(state.prefixOf('t1')).toBeUndefined()
  })

  it('skipped before the reply\'s message is written waits for it', async () => {
    const s = session()
    const { turn, stored } = reply(s, ['Mm-hm.', 'Let me look.'], 'It is sunny.', false)
    const st = store(new Map([['msg-1', stored]]))
    const done = st.unheard.skipped(s, 'L2')
    await flush()
    expect(st.rewrites).toEqual([])
    turn.written('msg-1')
    await done
    expect(st.messages.get('msg-1')).toBe('Mm-hm.\n\nIt is sunny.')
  })

  it('leaves a stored message that no longer reads as it was written, and its prefix with it', async () => {
    const s = session()
    const { state } = reply(s, ['Mm-hm.', 'Let me look.'], 'It is sunny.')
    const st = store(new Map([['msg-1', 'Something else entirely.']]))
    await st.unheard.skipped(s, 'L1')
    expect(st.messages.get('msg-1')).toBe('Something else entirely.')
    expect(state.prefixOf('t1')).toBe('Mm-hm. Let me look.')
  })

  it('is taken out of a turn the light model closed alone', async () => {
    const r = rig([json({ action: 'acknowledge', say: 'Right.' }), json({ action: 'close_turn', say: 'You are welcome.' })])
    await r.call({ seq: 1, moment: 'quietAfterWords', text: 'Okay' })
    await r.call({ seq: 2, moment: 'soundsFinished', text: 'Okay, thanks.' })
    expect(r.messages.get('turn-1')).toBe('Right. You are welcome.')
    const st = store(r.messages)
    await st.unheard.skipped(r.session, 'line-1')
    expect(st.rewrites).toEqual([{ turnId: 'turn-1', messageId: null }])
    expect(r.messages.get('turn-1')).toBe('You are welcome.')
  })

  it('never leaves a turn closed alone with nothing heard: its only line stays', async () => {
    const r = rig([json({ action: 'close_turn', say: 'You are welcome.' })])
    await r.call({ seq: 1, moment: 'soundsFinished', text: 'Thanks.' })
    const st = store(r.messages)
    await st.unheard.skipped(r.session, 'line-1')
    expect(r.messages.get('turn-1')).toBe('You are welcome.')
  })

  it('a line hq does not know is ignored', async () => {
    const st = store()
    await st.unheard.skipped(session(), 'nope')
    expect(st.rewrites).toEqual([])
  })
})
