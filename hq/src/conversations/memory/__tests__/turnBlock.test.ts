/**
 * Where the probe's findings go (memory and knowledge spec, What decides a recall): a block at the end of the
 * turn's own message, after the cache breakpoint, never in the system prompt.
 */
import { describe, it, expect } from 'vitest'
import type { ConversationMessageView } from '../../../shared/conversations/protocol'
import type { RecalledItem } from '../../../memory/contract'
import { leadMessages, systemParts } from '../../coordinator/context'
import { memoryTurnBlock, withMemoryBlock } from '../turnBlock'

const item = (key: string, title: string, body: string, pinned = false): RecalledItem => ({
  itemId: key, key, scope: 'PERSON', title, body, kind: 'PREFERENCE', tags: [], pinned, writtenAt: '2026-10-01T00:00:00Z',
})

function m(seq: number, role: 'PERSON' | 'AGENT', text: string, turnId: string | null = 't'): ConversationMessageView {
  return {
    id: `m${seq}`, seq, clientMessageId: null, role, authorId: null, agentId: null, kind: 'TEXT', body: { text }, spoken: false,
    interrupted: false, operationId: null, turnId, queueState: null, createdAt: '',
  } as ConversationMessageView
}

describe('memoryTurnBlock @SC-989', () => {
  it('gives pinned and certain items in full and the probable ones by title and key on one line', () => {
    const block = memoryTurnBlock({
      pinned: [item('sign-off', 'Sign-off', 'Signs as Sam', true)],
      certain: [item('coffee', 'Coffee', 'Black,\nno sugar')],
      probable: [{ key: 'staging', title: 'Staging server' }, { key: 'release-day', title: 'Release day' }],
    }, true)!
    expect(block.split('\n')).toEqual([
      '[Memory for this reply — from what you remembered before; the person did not write this]',
      'Pinned:',
      '- [sign-off] Sign-off: Signs as Sam',
      'Relevant now:',
      '- [coffee] Coffee: Black, no sugar',
      'Possibly relevant (recall by key to read): Staging server [staging]; Release day [release-day]',
      'If your reply relies on any of these, name their keys with used_memory as you finish.',
    ])
  })

  it('is nothing when the probe found nothing, and asks a turn with no tools to mark nothing', () => {
    expect(memoryTurnBlock({ pinned: [], certain: [], probable: [] }, true)).toBeNull()
    expect(memoryTurnBlock({ pinned: [item('a', 'A', 'b c')], certain: [], probable: [] }, false)).not.toMatch(/used_memory/)
  })
})

describe('withMemoryBlock @SC-989', () => {
  it('joins the block to the turn\'s own message, after the cache breakpoint, and leaves the system prompt alone', () => {
    const history = [m(1, 'PERSON', 'hi'), m(2, 'AGENT', 'hello'), m(3, 'PERSON', 'my usual order?', null)]
    const { messages, cacheAfter } = leadMessages(history, ['m3'])
    const system = systemParts({ agentName: 'Kernel', agentRole: null, placeLabel: 'their own space', agentInstructions: null, orgInstructions: null })
    const out = withMemoryBlock(messages, 'MEMORY BLOCK')
    expect(out.slice(0, -1)).toEqual(messages.slice(0, -1))
    expect(out.at(-1)).toEqual({ role: 'user', content: 'my usual order?\n\nMEMORY BLOCK' })
    expect(cacheAfter).toBe(1)
    expect(out.length - 1).toBeGreaterThan(cacheAfter!)
    expect(system.map(p => p.text).join('\n')).not.toMatch(/MEMORY BLOCK/)
  })

  it('adds the block as a message of its own when the last is not the person\'s, and changes nothing with no block', () => {
    const messages = [{ role: 'assistant' as const, content: 'x' }]
    expect(withMemoryBlock(messages, 'B')).toEqual([...messages, { role: 'user', content: 'B' }])
    expect(withMemoryBlock(messages, null)).toBe(messages)
  })
})
