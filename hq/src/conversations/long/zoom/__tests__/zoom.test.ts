import { describe, expect, it, vi } from 'vitest'
import type { ConversationMessageView } from '../../../../shared/conversations/protocol'
import type { TurnCapability } from '../../../contract'
import { expandSegments } from '../expand'
import { pageOfSpan } from '../readSpan'
import { createZoomTools, type ZoomDeps } from '../tools'
import type { SegmentRecord } from '../spans'


const seg = (n: number, summaryChars = 400): SegmentRecord => ({
  id: `s${n}`, firstSeq: n * 10, lastSeq: n * 10 + 9, firstAt: `2026-10-0${n}T10:00:00.000Z`, lastAt: `2026-10-0${n}T11:00:00.000Z`,
  brief: `Brief ${n}`, summary: 'x'.repeat(summaryChars),
})
const msg = (seq: number, text: string, role: 'PERSON' | 'AGENT' = 'PERSON'): ConversationMessageView => ({
  id: `m${seq}`, seq, clientMessageId: null, role, authorId: null, agentId: null, kind: 'TEXT', body: { text }, spoken: false,
  interrupted: false, operationId: null, turnId: null, queueState: null, createdAt: '2026-10-01T10:00:00.000Z',
} as ConversationMessageView)

describe('expand @SC-982', () => {
  const all = [seg(1), seg(2), seg(3)]

  it('returns one segment with its span and summary', () => {
    const r = expandSegments(all, ['s2'], 10_000)
    expect(r.expanded.map(e => e.segment)).toEqual(['s2'])
    expect(r.expanded[0]).toMatchObject({ firstSeq: 20, lastSeq: 29, brief: 'Brief 2' })
    expect(r.notIncluded).toEqual([])
  })

  it('returns several in span order whatever order they were asked in', () => {
    expect(expandSegments(all, ['s3', 's1'], 10_000).expanded.map(e => e.segment)).toEqual(['s1', 's3'])
  })

  it('returns all of them in span order', () => {
    expect(expandSegments([seg(3), seg(1), seg(2)], 'all', 10_000).expanded.map(e => e.segment)).toEqual(['s1', 's2', 's3'])
  })

  it('delivers what fits oldest first and names the rest', () => {
    const r = expandSegments(all, 'all', 250) // each summary is 100 tokens
    expect(r.expanded.map(e => e.segment)).toEqual(['s1', 's2'])
    expect(r.notIncluded.map(e => e.segment)).toEqual(['s3'])
    expect(r.notIncluded[0]).toMatchObject({ brief: 'Brief 3', firstSeq: 30 })
    expect(r.note).toContain('1 more')
  })

  it('does not skip over a segment that does not fit to take a later one', () => {
    const r = expandSegments([seg(1, 4_000), seg(2, 40)], 'all', 500)
    expect(r.expanded).toEqual([])
    expect(r.notIncluded.map(e => e.segment)).toEqual(['s1', 's2'])
  })

  it('names an id that is not a segment of the conversation', () => {
    const r = expandSegments(all, ['s1', 'nope'], 10_000)
    expect(r.unknown).toEqual(['nope'])
    expect(r.note).toContain('nope')
  })
})

describe('messages @SC-982', () => {
  const s = seg(1)

  it('pages the span by size and says what remains', () => {
    const record = [msg(10, 'a'.repeat(5_000)), msg(11, 'b'.repeat(5_000)), msg(12, 'c'.repeat(5_000))]
    const first = pageOfSpan(s, record, 1)
    expect(first.pages).toBeGreaterThan(1)
    expect(first.messages[0].seq).toBe(10)
    expect(first.remaining).toBeGreaterThan(0)
    expect(first.note).toContain('page 2')
    const last = pageOfSpan(s, record, first.pages)
    expect(last.remaining).toBe(0)
    expect(last.messages.at(-1)?.seq).toBe(12)
  })

  it('keeps a short span on one page, verbatim and in order', () => {
    const r = pageOfSpan(s, [msg(10, 'What is the budget?'), msg(11, 'Forty thousand.', 'AGENT')], 1)
    expect(r.pages).toBe(1)
    expect(r.messages.map(m => [m.from, m.text])).toEqual([['person', 'What is the budget?'], ['agent', 'Forty thousand.']])
    expect(r.remaining).toBe(0)
  })

  it('no page passes its size, even for one very long message', () => {
    const r = pageOfSpan(s, [msg(10, 'z'.repeat(30_000))], 1)
    expect(r.pages).toBeGreaterThan(1)
    expect(r.messages[0].text.length).toBeLessThanOrEqual(8_000)
  })
})

describe('the zoom tools @SC-982', () => {
  const capability = { conversationId: 'c1', turnId: 't1', agentId: 'a1', expiresAt: Date.now() + 60_000, trigger: 'MESSAGE' } as TurnCapability
  const deps = (over: Partial<ZoomDeps> = {}): ZoomDeps => ({
    segments: async () => [seg(1), seg(2)],
    folded: async () => true,
    messagesIn: async () => [msg(10, 'Hello')],
    roomTokens: async () => 150,
    offerNewConversation: vi.fn(async () => {}),
    ...over,
  })
  const tool = (d: ZoomDeps, name: string) => createZoomTools(d).find(t => t.name === name)!

  it('expand takes the room left in the window, less what earlier expansions in the turn took', async () => {
    const t = tool(deps(), 'expand')
    const first = await t.run(capability, { segments: ['s1'] }, { signal: new AbortController().signal })
    expect(first).toMatchObject({ status: 'done' })
    const second = await t.run(capability, { segments: ['s2'] }, { signal: new AbortController().signal })
    // 150 room, 100 spent on s1: s2 (100) no longer fits and is named.
    expect((second as { result: { notIncluded: unknown[] } }).result.notIncluded).toHaveLength(1)
  })

  it('expand refuses on a conversation not compacted yet', async () => {
    const t = tool(deps({ segments: async () => [] }), 'expand')
    expect(await t.run(capability, { segments: 'all' }, { signal: new AbortController().signal })).toMatchObject({ status: 'refused' })
  })

  it('messages refuses a segment of another conversation', async () => {
    const t = tool(deps(), 'messages')
    expect(await t.run(capability, { segment: 'other' }, { signal: new AbortController().signal })).toMatchObject({ status: 'refused' })
  })

  it('messages reads the span of the segment asked for', async () => {
    const messagesIn = vi.fn(async () => [msg(10, 'Hello')])
    const out = await tool(deps({ messagesIn }), 'messages').run(capability, { segment: 's2', page: 1 }, { signal: new AbortController().signal })
    expect(messagesIn).toHaveBeenCalledWith('c1', 20, 29)
    expect(out).toMatchObject({ status: 'done' })
  })

  it('offers no tool to a report turn, and the offer only to a turn a person reads', async () => {
    const report = { ...capability, trigger: 'REPORT' } as TurnCapability
    const continuation = { ...capability, trigger: 'CONTINUATION' } as TurnCapability
    for (const name of ['expand', 'messages', 'offer_new_conversation']) expect(await tool(deps(), name).offered(report)).toBe(false)
    expect(await tool(deps(), 'offer_new_conversation').offered(continuation)).toBe(false)
    expect(await tool(deps(), 'expand').offered(capability)).toBe(true)
  })

  it('offers expand and messages only once something is folded, and not when that cannot be read', async () => {
    for (const name of ['expand', 'messages']) {
      expect(await tool(deps({ folded: async () => false }), name).offered(capability)).toBe(false)
      expect(await tool(deps({ folded: async () => { throw new Error('no database') } }), name).offered(capability)).toBe(false)
      expect(await tool(deps(), name).offered(capability)).toBe(true)
    }
    expect(await tool(deps({ folded: async () => false }), 'offer_new_conversation').offered(capability)).toBe(true)
  })

  it('the offer writes one line about the subject', async () => {
    const d = deps()
    await tool(d, 'offer_new_conversation').run(capability, { about: ' the website ' }, { signal: new AbortController().signal })
    expect(d.offerNewConversation).toHaveBeenCalledWith(capability, 'the website')
  })
})
