/**
 * The lead's voice logic as one module (voice that stays in the conversation, spec §1 and §2; plan task 4b.1): the
 * keep_listening tool's definition, when a turn may be held, how much a step reasons, and the reading of one model
 * step's stream into the reply's text, a hold and work started. Both hq's turn and the voice playground run it.
 */
import { describe, expect, it } from 'vitest'
import type { LeadStreamEvent, LeadToolCall, TurnUsage } from '../../contract'
import {
  KEEP_LISTENING, KEEP_LISTENING_DESCRIPTION, NOT_HELD, canHold, heldNote, holdReason, keepListeningInput,
  keepListeningDefinition, readLeadStep, reasoningFor, voiceTurnBlock,
} from '../voiceLogic'

const usage: TurnUsage = { inputTokens: 4, outputTokens: 2, cacheReadTokens: 1, cacheWriteTokens: 0 }
const finish: LeadStreamEvent = { type: 'finish', reason: 'stop', usage }
const text = (t: string): LeadStreamEvent => ({ type: 'text', text: t })
const call = (name: string, input: unknown = {}, id = `c-${name}`): LeadStreamEvent => ({ type: 'tool-call', call: { id, name, input } })
const hold = (reason = 'ended on "and"') => call(KEEP_LISTENING, { reason })

function reader(opts: { spokenMessage?: boolean; mayHold?: boolean; before?: string; startsWork?: ReadonlySet<string>; tones?: string[] } = {}) {
  let replied = opts.before ?? ''
  const streamed: string[] = []
  const holds: LeadToolCall[] = []
  const finished: TurnUsage[] = []
  const r = readLeadStep({
    spokenMessage: opts.spokenMessage ?? true,
    mayHold: () => opts.mayHold ?? true,
    replied: () => replied,
    stream: piece => { streamed.push(piece); replied += piece },
    hold: c => holds.push(c),
    finish: e => finished.push(e.usage),
    ...(opts.startsWork ? { startsWork: opts.startsWork } : {}),
    ...(opts.tones ? { toneTag: (t: string) => { opts.tones!.push(t) } } : {}),
  })
  const read = (events: LeadStreamEvent[]) => { for (const e of events) r.take(e); return r.result() }
  return { read, streamed, holds, finished }
}

describe('the keep_listening tool, as the module defines it @SC-1830', () => {
  it('has the name, the description the accepted instruction was checked with, and a short reason', () => {
    expect(KEEP_LISTENING).toBe('keep_listening')
    expect(KEEP_LISTENING_DESCRIPTION).toMatch(/^Use this when the person has not finished their thought\. Write no text with this call\./)
    expect(keepListeningInput.safeParse({ reason: 'ended on "so"' }).success).toBe(true)
    expect(keepListeningInput.safeParse({ reason: 'x'.repeat(301) }).success).toBe(false)
    expect(keepListeningDefinition()).toEqual({ name: KEEP_LISTENING, description: KEEP_LISTENING_DESCRIPTION, input: keepListeningInput })
  })

  it('tells the model of a call that cannot hold to answer the person', () => {
    expect(NOT_HELD).toMatchObject({ status: 'refused', reason: expect.stringMatching(/Answer the person\.$/) })
  })

  it("names the call's reason, trimmed and short, or says none was given", () => {
    expect(holdReason({ id: 'a', name: KEEP_LISTENING, input: { reason: '  ended on "and" ' } })).toBe('ended on "and"')
    expect(holdReason({ id: 'a', name: KEEP_LISTENING, input: { reason: 'x'.repeat(250) } })).toHaveLength(200)
    expect(holdReason({ id: 'a', name: KEEP_LISTENING, input: null })).toBe('(no reason given)')
    expect(holdReason({ id: 'a', name: KEEP_LISTENING, input: { reason: '   ' } })).toBe('(no reason given)')
  })
})

describe('when a turn may be held @SC-1830', () => {
  it('only while nothing it did is in the thread: no work started, nothing waiting for an okay', () => {
    expect(canHold([])).toBe(true)
    expect(canHold([{ outcome: { status: 'done', operationId: 'o', result: [] } }, { outcome: { status: 'refused', reason: 'no' } }])).toBe(true)
    expect(canHold([{ outcome: { status: 'accepted', operationId: 'o' } }])).toBe(false)
    expect(canHold([{ outcome: { status: 'waitingApproval', operationId: 'o' } }])).toBe(false)
  })
})

describe('how much a step reasons @SC-1838', () => {
  it('least on the first step of a reply to a spoken message, freely after; least throughout a reply someone only hears', () => {
    expect(reasoningFor({ heard: false, spokenMessage: false, step: 0 })).toEqual({})
    expect(reasoningFor({ heard: true, spokenMessage: false, step: 0 })).toEqual({ spoken: true })
    expect(reasoningFor({ heard: true, spokenMessage: false, step: 2 })).toEqual({ spoken: true })
    expect(reasoningFor({ heard: true, spokenMessage: true, step: 0 })).toEqual({ spoken: true, firstSpokenStep: true })
    expect(reasoningFor({ heard: true, spokenMessage: true, step: 1 })).toEqual({})
  })
})

describe('the reply\'s tone tag, read from the stream (spec §The heavy model → Its tone) @SC-2235', () => {
  it('is taken out of a step split across pieces: nothing of it is streamed, its tone is heard', () => {
    const tones: string[] = []
    const { read, streamed } = reader({ tones })
    const r = read([text('[tone'), text(': gen'), text('tle] '), text('I am sorry.'), finish])
    expect(streamed.join('')).toBe('I am sorry.')
    expect(r.text).toBe('I am sorry.')
    expect(tones).toEqual(['gentle'])
  })

  it('a bad tag is taken out and is calm; no tag streams as written', () => {
    const bad: string[] = []
    expect(reader({ tones: bad }).read([text('[tone: shouty] Okay.'), finish]).text).toBe('Okay.')
    expect(bad).toEqual(['calm'])
    const none: string[] = []
    const plain = reader({ tones: none })
    expect(plain.read([text('Okay'), text(', sure.'), finish]).text).toBe('Okay, sure.')
    expect(none).toEqual([])
  })

  it('a later step opening with a tag is taken out too, and no separator is streamed for a step of only a tag', () => {
    const tones: string[] = []
    const { read, streamed } = reader({ tones, before: 'Let me look.' })
    read([text('[tone: bright]'), call('list_projects'), finish])
    expect(streamed).toEqual([])
    expect(tones).toEqual(['bright'])
  })

  it('without the tag asked for, a bracket at the start is the reply\'s own', () => {
    expect(reader().read([text('[tone: warm] Hi.'), finish]).text).toBe('[tone: warm] Hi.')
  })
})

describe('reading one step of the stream', () => {
  it('streams a finished reply from its first piece, with the calls and the usage', () => {
    const { read, streamed, holds, finished } = reader()
    const r = read([text('Two of them.'), text(' Want the list?'), call('list_projects'), finish])
    expect(streamed).toEqual(['Two of them.', ' Want the list?'])
    expect(r).toMatchObject({ text: 'Two of them. Want the list?', held: null, work: [] })
    expect(r.calls.map(c => c.name)).toEqual(['list_projects'])
    expect(holds).toEqual([])
    expect(finished).toEqual([usage])
  })

  it('skips empty pieces', () => {
    const { read, streamed } = reader()
    expect(read([text(''), text('Yes.'), finish]).text).toBe('Yes.')
    expect(streamed).toEqual(['Yes.'])
  })

  it("puts a blank line between an earlier step's words and this one's", () => {
    const { read, streamed } = reader({ before: 'Let me look.' })
    read([text('Found it.'), finish])
    expect(streamed).toEqual(['\n\n', 'Found it.'])
    const after = reader({ before: 'Let me look.\n' })
    after.read([text('Found it.'), finish])
    expect(after.streamed).toEqual(['Found it.'])
  })

  it('holds a spoken message on a keep_listening call: streams nothing after it, and runs nothing beside it', () => {
    const { read, streamed, holds } = reader()
    const r = read([text('Mm, go on.'), hold(), text(' Take your time.'), call('start_work', { title: 'x' }), finish])
    expect(streamed).toEqual(['Mm, go on.'])
    expect(holds.map(c => c.name)).toEqual([KEEP_LISTENING])
    expect(r.held).toMatchObject({ name: KEEP_LISTENING, input: { reason: 'ended on "and"' } })
    expect(r.calls.map(c => c.name)).toEqual([KEEP_LISTENING, 'start_work'])
    expect(heldNote(r.held!, r.calls, 'Mm, go on.')).toBe('ended on "and"; the words it wrote first were withdrawn; not run: start_work')
  })

  it('holds once, on the first call', () => {
    const { read, holds } = reader()
    const r = read([hold('first'), hold('second'), finish])
    expect(holds).toHaveLength(1)
    expect(holdReason(r.held!)).toBe('first')
  })

  it('does not hold a message that was not spoken, nor once work has started: the call is one more call', () => {
    for (const opts of [{ spokenMessage: false }, { mayHold: false }]) {
      const { read, holds, streamed } = reader(opts)
      const r = read([hold(), text('Sure, what next?'), finish])
      expect(r.held).toBeNull()
      expect(holds).toEqual([])
      expect(streamed).toEqual(['Sure, what next?'])
      expect(r.calls.map(c => c.name)).toEqual([KEEP_LISTENING])
    }
  })

  it('says which calls start work, by the names the caller gives', () => {
    const { read } = reader({ startsWork: new Set(['start_work']) })
    const r = read([text("I'll look into the stale tasks."), call('start_work', { title: 'Stale tasks' }), call('list_projects'), finish])
    expect(r.work.map(c => c.name)).toEqual(['start_work'])
  })

  it('a hold notes no withdrawn words when only whitespace came first, and nothing not run when it was alone', () => {
    const { read } = reader()
    const r = read([text('\n'), hold(), finish])
    expect(heldNote(r.held!, r.calls, '\n')).toBe('ended on "and"')
  })
})

describe('the voice turn block, from the module @SC-1830 @SC-1831', () => {
  it('is the block the turn adds', () => {
    expect(voiceTurnBlock({ spoken: true, adaptiveVoice: true, trailedOff: false, wentOn: false })).toMatch(/call the keep_listening tool/)
  })
})
