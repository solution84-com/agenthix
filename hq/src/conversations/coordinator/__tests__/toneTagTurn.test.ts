/**
 * The reply's tone tag in hq's turn (adaptive voice listening, spec §The heavy model → *Its tone*): asked for with Tone
 * on, it is taken out before anything reaches the screens, the speech or the record, split across pieces included, and
 * the speech hears its tone before the reply's first words. The model plays recorded replies.
 */
import { describe, expect, it, vi } from 'vitest'
import type { LeadStreamEvent } from '../../contract'
import { runTurn } from '../turn'
import { harness, scriptedModel, usage } from './turnHarness'

const finish = (reason: 'stop' | 'tool-calls' = 'stop'): LeadStreamEvent => ({ type: 'finish', reason, usage: usage(3) })
const text = (t: string): LeadStreamEvent => ({ type: 'text', text: t })

function heardTurn(steps: LeadStreamEvent[][], toneTag: boolean) {
  const h = harness(scriptedModel(steps), { list_projects: { status: 'done', operationId: 'op-r', result: [] } })
  const calls: string[] = []
  const speech = {
    text: vi.fn((full: string) => { calls.push(`text:${full}`) }),
    end: vi.fn((_s: string, full: string) => ({ text: full, interrupted: false })),
    written: vi.fn(), hold: vi.fn(),
    tone: vi.fn((t: string | null) => { calls.push(`tone:${t}`) }),
  }
  h.deps.voice = { begin: () => speech }
  h.deps.context = vi.fn(async () => ({
    system: [{ text: 'base', cacheAfter: true }], messages: [{ role: 'user' as const, content: 'my dog died' }],
    ...(toneTag && { toneTag: true }),
  }))
  return { h, speech, calls }
}

describe("the reply's tone tag in the turn @SC-2235", () => {
  it('never reaches the screens, the speech or the record, even split; its tone comes before the first words', async () => {
    const { h, speech, calls } = heardTurn([[text('[tone'), text(': gentle]'), text(' I am so sorry.'), finish()]], true)
    const outcome = await runTurn(h.deps, h.run().running)
    expect(outcome.text).toBe('I am so sorry.')
    expect(h.deltas.map(d => d.text).join('')).toBe('I am so sorry.')
    expect(h.stored[0]).toMatchObject({ kind: 'TEXT', body: { text: 'I am so sorry.' } })
    expect(speech.tone).toHaveBeenCalledWith('gentle')
    expect(calls[0]).toBe('tone:gentle')
    expect(calls.every(c => !c.includes('[tone'))).toBe(true)
  })

  it('a bad tag is taken out and calm; no tag leaves the reply calm and as written', async () => {
    const bad = heardTurn([[text('[tone: furious] Okay.'), finish()]], true)
    expect((await runTurn(bad.h.deps, bad.h.run().running)).text).toBe('Okay.')
    expect(bad.speech.tone).toHaveBeenCalledWith('calm')
    const none = heardTurn([[text('Okay.'), finish()]], true)
    expect((await runTurn(none.h.deps, none.h.run().running)).text).toBe('Okay.')
    expect(none.speech.tone).not.toHaveBeenCalled()
  })

  it("a later step's tag is taken out, and does not change the reply's tone", async () => {
    const { h, speech } = heardTurn([
      [text('[tone: warm] Let me look.'), { type: 'tool-call', call: { id: 'c1', name: 'list_projects', input: {} } }, finish('tool-calls')],
      [text('[tone: bright] Two of them.'), finish()],
    ], true)
    const outcome = await runTurn(h.deps, h.run().running)
    expect(outcome.text).toBe('Let me look.\n\nTwo of them.')
    expect(speech.tone.mock.calls).toEqual([['warm']])
  })

  it('with Tone off nothing is asked, so nothing is taken out', async () => {
    const { h, speech } = heardTurn([[text('[tone: warm] Hi.'), finish()]], false)
    expect((await runTurn(h.deps, h.run().running)).text).toBe('[tone: warm] Hi.')
    expect(speech.tone).not.toHaveBeenCalled()
  })
})
