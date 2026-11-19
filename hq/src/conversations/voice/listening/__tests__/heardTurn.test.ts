/**
 * A heavy reply under the light model, run by hq's own turn (coordinator/turn.ts): its stored agent message starts with
 * what the person heard while they spoke, then the reply; the heavy model's request carries neither (they are in the
 * next turn's history, never this one's).
 */
import { describe, expect, it, vi } from 'vitest'
import type { LeadStreamEvent } from '../../../contract'
import { runTurn } from '../../../coordinator/turn'
import { harness, scriptedModel, usage } from '../../../coordinator/__tests__/turnHarness'
import { withHeardLines } from '../heard'
import { ListeningState } from '../state'

const reply = (text: string): LeadStreamEvent[] => [{ type: 'text', text }, { type: 'finish', reason: 'stop', usage: usage(3) }]

describe('the agent message of a reply under the light model @SC-2215', () => {
  it('stores the lines heard, in order, then the reply; the model never reads them this turn', async () => {
    const model = scriptedModel([reply('It is sunny in Melbourne.')])
    const h = harness(model)
    const state = new ListeningState()
    state.sent('a', 'Mm-hm.')
    state.sent('b', 'Ooh, let me check the weather in Melbourne.')
    state.played('a')
    const after = vi.fn()
    const speech = { text: vi.fn(), end: vi.fn((_s: string, full: string) => ({ text: full, interrupted: false })), written: vi.fn(), hold: vi.fn() }
    h.deps.voice = { begin: () => withHeardLines(speech, 't1', state, after) }

    await runTurn(h.deps, h.run().running)

    const agent = h.stored.filter(m => m.role === 'AGENT' && m.kind === 'TEXT')
    expect(agent.map(m => (m.kind === 'TEXT' ? m.body.text : ''))).toEqual([
      'Mm-hm. Ooh, let me check the weather in Melbourne.\n\nIt is sunny in Melbourne.',
    ])
    expect(JSON.stringify(model.requests)).not.toContain('let me check the weather')
    expect(after).toHaveBeenCalledTimes(1)
  })
})
