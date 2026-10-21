/**
 * The four parts (long conversations spec, The record keeps everything): the instructions and the compaction block,
 * each with its breakpoint; the window after the latest segment, its marker left to the block; the block rebuilt
 * at each compaction and the same text otherwise.
 */
import { describe, it, expect } from 'vitest'
import type { ConversationMessageView } from '../../../shared/conversations/protocol'
import { leadMessages, systemWithBlock, windowOf } from '../../coordinator/context'
import { compactionBlock, type OpenedSegment } from '../block'

const instructions = { agentName: 'Kernel', agentRole: null, placeLabel: 'their own space', agentInstructions: null, orgInstructions: null }

const segment = (id: string, firstSeq: number, lastSeq: number, extra: Partial<OpenedSegment> = {}): OpenedSegment => ({
  id, firstSeq, lastSeq, firstAt: '2026-10-01T09:00:00.000Z', lastAt: '2026-10-01T11:30:00.000Z',
  brief: `Brief of ${id}`, summary: `Full summary of ${id}`, ledgerHead: [], ...extra,
})

function m(seq: number, role: 'PERSON' | 'AGENT' | 'PLATFORM', kind: string, body: unknown, extra: Partial<ConversationMessageView> = {}): ConversationMessageView {
  return {
    id: `m${seq}`, seq, clientMessageId: null, role, authorId: null, agentId: null, kind, body, spoken: false,
    interrupted: false, operationId: null, turnId: 't', queueState: null, createdAt: '', ...extra,
  } as ConversationMessageView
}

describe('the compaction block @SC-980', () => {
  it('is absent before the first compaction: one breakpoint, after the instructions', () => {
    const parts = systemWithBlock(instructions, [])
    expect(parts.filter(p => p.cacheAfter)).toHaveLength(1)
    expect(compactionBlock([])).toBeNull()
  })

  it('follows the instructions as a second part with its own breakpoint', () => {
    const parts = systemWithBlock(instructions, [segment('s1', 1, 40)])
    expect(parts).toHaveLength(2)
    expect(parts.map(p => p.cacheAfter)).toEqual([true, true])
    expect(parts[1]!.text).toMatch(/^# Earlier in this conversation/)
  })

  it('holds the ledger head as of the latest segment, older segments by brief, the latest in full', () => {
    const block = compactionBlock([
      segment('s1', 1, 40, { ledgerHead: [{ id: 'L1', kind: 'decision', text: 'Stale head', at: '' }] }),
      segment('s2', 41, 90, { ledgerHead: [{ id: 'L1', kind: 'decision', text: 'Use Postgres', at: '' }] }),
    ])!
    expect(block).toContain('Use Postgres [L1]')
    expect(block).not.toContain('Stale head')
    expect(block).toContain('- s1 (messages 1–40, 2026-10-01 09:00 to 2026-10-01 11:30 UTC): Brief of s1')
    expect(block).not.toContain('Full summary of s1')
    expect(block).toContain('Full summary of s2')
  })

  it('is the same text every time from the same segments, and rebuilt when a segment is added', () => {
    const one = [segment('s1', 1, 40)]
    expect(compactionBlock(one)).toBe(compactionBlock([segment('s1', 1, 40)]))
    expect(compactionBlock([...one, segment('s2', 41, 90)])).not.toBe(compactionBlock(one))
  })
})

describe('the window @SC-980', () => {
  it('holds only the messages after the latest span, leaving the compaction marker to the block', () => {
    const history = [
      m(1, 'PERSON', 'TEXT', { text: 'old' }),
      m(2, 'AGENT', 'TEXT', { text: 'old reply' }),
      m(3, 'PERSON', 'TEXT', { text: 'kept' }),
      m(4, 'AGENT', 'TEXT', { text: 'kept reply' }),
      m(5, 'PLATFORM', 'SUMMARISED', { brief: 'b', summary: 's', segmentId: 's1', firstSeq: 1, lastSeq: 2 }),
      m(6, 'PERSON', 'TEXT', { text: 'now' }, { turnId: null }),
    ]
    const { messages, cacheAfter } = leadMessages(windowOf(history, [segment('s1', 1, 2)]), ['m6'])
    expect(messages).toEqual([
      { role: 'user', content: 'kept' },
      { role: 'assistant', content: 'kept reply' },
      { role: 'user', content: 'now' },
    ])
    expect(cacheAfter).toBe(1)
  })
})
