import { describe, it, expect } from 'vitest'
import { runEventsOf } from '../claudeMessages'
import type { TurnText } from '../claudeMessages'

const start = (type: string) => ({ type: 'stream_event', event: { type: 'content_block_start', content_block: { type } } })
const text = (t: string) => ({ type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text: t } } })

describe('streamed text blocks', () => {
  it('starts a text block that follows an earlier one on a new paragraph, none inside a block', () => {
    const state: TurnText = { seen: false, breakPending: false }
    const out = [
      start('text'), text('Let me look. '), text('One sec.'),
      start('tool_use'),
      start('text'), text('Found '), text('it.'),
    ].flatMap(m => runEventsOf(m, state))
    const deltas = out.flatMap(e => (e.type === 'text_delta' ? [e.textDelta] : []))
    expect(deltas).toEqual(['Let me look. ', 'One sec.', '\n\nFound ', 'it.'])
  })
})

describe('round trips with the model', () => {
  const assistant = (id: string, blocks: unknown[]) => ({ type: 'assistant', message: { id, content: blocks } })

  it('counts one per model response, however many content blocks it arrives in', () => {
    const state: TurnText = { seen: false, breakPending: false, modelResponses: new Set() }
    const out = [
      assistant('msg_1', [{ type: 'text', text: 'Looking.' }]),
      assistant('msg_1', [{ type: 'tool_use', id: 't1', name: 'Bash', input: {} }]),
      assistant('msg_2', [{ type: 'text', text: 'Done.' }]),
    ].flatMap(m => runEventsOf(m, state))
    expect(out.filter(e => e.type === 'model_round_trip')).toHaveLength(2)
    expect(out.filter(e => e.type === 'tool_call')).toHaveLength(1)
  })
})
