/**
 * The probe's composed query (memory and knowledge spec, What decides a recall): the new message first, then the
 * running topic, then the last two exchanges, the latest first, held to a few hundred tokens.
 */
import { describe, it, expect } from 'vitest'
import type { ConversationMessageView } from '../../../shared/conversations/protocol'
import { COMPOSED_QUERY_MAX_CHARS, composeQuery } from '../composedQuery'

function m(seq: number, role: 'PERSON' | 'AGENT' | 'PLATFORM', kind: string, body: unknown, extra: Partial<ConversationMessageView> = {}): ConversationMessageView {
  return {
    id: `m${seq}`, seq, clientMessageId: null, role, authorId: null, agentId: null, kind, body, spoken: false,
    interrupted: false, operationId: null, turnId: 't', queueState: null, createdAt: '', ...extra,
  } as ConversationMessageView
}

const said = (seq: number, role: 'PERSON' | 'AGENT', text: string, extra: Partial<ConversationMessageView> = {}) => m(seq, role, 'TEXT', { text }, extra)

describe('composeQuery @SC-989', () => {
  it('puts the new message first, then the title, then the last two exchanges, the latest first', () => {
    const history = [
      said(1, 'PERSON', 'Plan the launch of the shop'),
      said(2, 'AGENT', 'Sure, what date?'),
      said(3, 'PERSON', 'Next Thursday'),
      said(4, 'AGENT', 'Thursday it is'),
      said(5, 'PERSON', 'Who reviews the copy?'),
      said(6, 'AGENT', 'Sam usually does'),
      said(7, 'PERSON', 'yes, do that', { turnId: null }),
    ]
    expect(composeQuery(history, ['m7'], 'Shop launch').split('\n')).toEqual([
      'yes, do that',
      'Shop launch',
      'Sam usually does',
      'Who reviews the copy?',
      'Thursday it is',
      'Next Thursday',
    ])
  })

  it('takes the first message as the topic when the conversation has no title', () => {
    const history = [said(1, 'PERSON', 'Plan the launch'), said(2, 'AGENT', 'Sure'), said(3, 'PERSON', 'go on', { turnId: null })]
    expect(composeQuery(history, ['m3'], null).split('\n')).toEqual(['go on', 'Plan the launch', 'Sure'])
  })

  it('joins several new messages, reads what came back for a report, and leaves out a cancelled message', () => {
    const history = [
      said(1, 'PERSON', 'Review the README'),
      said(2, 'PERSON', 'never mind', { queueState: 'CANCELLED' }),
      m(3, 'PLATFORM', 'RESULT', { title: 'Review the README', summary: 'Found 3 issues', outcome: 'completed' }),
    ]
    const query = composeQuery(history, ['m3'], null)
    expect(query.split('\n')[0]).toBe('Review the README: Found 3 issues')
    expect(query).not.toMatch(/never mind/)
  })

  it('stays within a few hundred tokens, keeping the new message whole when it is short', () => {
    const long = 'word '.repeat(400)
    const history = [said(1, 'PERSON', long), said(2, 'AGENT', long), said(3, 'PERSON', 'the deploy key?', { turnId: null })]
    const query = composeQuery(history, ['m3'], long)
    expect(query.length).toBeLessThanOrEqual(COMPOSED_QUERY_MAX_CHARS)
    expect(query.startsWith('the deploy key?\n')).toBe(true)
  })
})
