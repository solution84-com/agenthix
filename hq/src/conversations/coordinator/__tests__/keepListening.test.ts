/**
 * The lead holding a spoken message open (voice that stays in the conversation, spec §2; ADR-0179): a keep_listening
 * call on a spoken message ends the turn with nothing said, no message and no second model call, the reason logged and
 * the holder told; anywhere else the call is ignored as a failed call and the turn goes on. The model plays recorded
 * replies; the tool adapter, the record and the screens are the harness's.
 */
import { describe, expect, it, vi } from 'vitest'
import type { LeadStreamEvent, TurnCapability } from '../../contract'
import { runTurn } from '../turn'
import { KEEP_LISTENING, KEEP_LISTENING_DESCRIPTION, NOT_HELD, createKeepListeningTool } from '../keepListening'
import { harness, scriptedModel, usage } from './turnHarness'

const finish = (reason: 'stop' | 'tool-calls' = 'stop'): LeadStreamEvent => ({ type: 'finish', reason, usage: usage(3) })
const call = (name: string, input: unknown, id = `c-${name}`): LeadStreamEvent => ({ type: 'tool-call', call: { id, name, input } })
const hold = (reason = 'ended on "and"') => call(KEEP_LISTENING, { reason })

/** A turn whose context answers a spoken message under the voice turn block, heard through a speech stand-in. */
function spokenTurn(steps: LeadStreamEvent[][], spokenMessage = true) {
  const model = scriptedModel(steps)
  const h = harness(model, { start_work: { status: 'accepted', operationId: 'op-1' } }, { 'op-1': { title: 'Find the stale tasks', state: 'RUNNING', outstanding: 1 } })
  const speech = { text: vi.fn(), end: vi.fn((_s: string, full: string) => ({ text: full, interrupted: false })), written: vi.fn(), hold: vi.fn() }
  speech.hold.mockImplementation(() => { speech.end.mockImplementation(() => ({ text: '', interrupted: true, withdrawn: true })) })
  h.deps.voice = { begin: () => speech }
  h.deps.context = vi.fn(async () => ({
    system: [{ text: 'base', cacheAfter: true }], messages: [{ role: 'user' as const, content: 'so I was thinking we could' }],
    ...(spokenMessage ? { spokenMessage: true } : {}),
  }))
  return { h, model, speech }
}

describe('a spoken message the lead judges unfinished @SC-1830', () => {
  it('ends the turn there: nothing said, no message, no second model call, the reason logged and the holder told', async () => {
    const { h, model, speech } = spokenTurn([[hold(), finish('tool-calls')]])
    const outcome = await runTurn(h.deps, h.run().running)

    expect(outcome).toMatchObject({ state: 'COMPLETED', text: '' })
    expect(h.stored).toEqual([])
    expect(model.requests).toHaveLength(1)
    expect(h.toolCall).not.toHaveBeenCalled()
    expect(speech.hold).toHaveBeenCalledTimes(1)
    expect(h.logs.some(l => /held by keep_listening: ended on "and"$/.test(l))).toBe(true)
    expect(h.ended[0]).toMatchObject({ state: 'COMPLETED', usage: usage(3) })
  })

  it('ignores whitespace written before the call, and holds', async () => {
    const { h, speech } = spokenTurn([[{ type: 'text', text: '\n' }, hold(), finish('tool-calls')]])
    await runTurn(h.deps, h.run().running)
    expect(h.stored).toEqual([])
    expect(speech.hold).toHaveBeenCalledTimes(1)
    expect(h.logs.some(l => /held by keep_listening/.test(l) && !/withdrawn/.test(l))).toBe(true)
  })

  it('withdraws words written before the call, streams nothing after it, and holds', async () => {
    const { h, speech } = spokenTurn([[{ type: 'text', text: 'Mm, go on.' }, hold(), { type: 'text', text: ' Take your time.' }, finish('tool-calls')]])
    const outcome = await runTurn(h.deps, h.run().running)
    expect(outcome.text).toBe('')
    expect(h.stored).toEqual([])
    expect(h.deltas.map(d => d.text)).toEqual(['Mm, go on.'])
    expect(speech.hold).toHaveBeenCalledTimes(1)
    expect(h.logs.some(l => /the words it wrote first were withdrawn/.test(l))).toBe(true)
  })

  it('runs none of the other calls made beside it', async () => {
    const { h } = spokenTurn([[call('start_work', { brief: 'x' }), hold(), finish('tool-calls')]])
    await runTurn(h.deps, h.run().running)
    expect(h.toolCall).not.toHaveBeenCalled()
    expect(h.stored).toEqual([])
    expect(h.logs.some(l => /not run: start_work/.test(l))).toBe(true)
  })

  it('cannot hold once the reply has started work: the call is ignored and the reply goes on', async () => {
    const { h, model, speech } = spokenTurn([
      [{ type: 'text', text: "I'll look into the stale tasks." }, call('start_work', { brief: 'x' }), call('list_projects', {}), finish('tool-calls')],
      [hold(), finish('tool-calls')],
      [{ type: 'text', text: 'It is running.' }, finish()],
    ])
    h.toolCall.mockImplementation(async (_c, c) => (c.name === 'start_work' ? { status: 'accepted', operationId: 'op-1' } : { status: 'done', operationId: 'op-read', result: [] }))
    await runTurn(h.deps, h.run().running)
    expect(speech.hold).not.toHaveBeenCalled()
    expect(model.requests).toHaveLength(3)
    expect(h.stored.at(-1)).toMatchObject({ kind: 'TEXT', body: { text: expect.stringContaining('It is running.') } })
  })
})

describe('a keep_listening call on any other turn @SC-1830', () => {
  it('on a typed message is ignored as a failed call, never through the tool adapter, and the turn answers as it would', async () => {
    const { h, model, speech } = spokenTurn([[hold(), finish('tool-calls')], [{ type: 'text', text: 'Sure, what next?' }, finish()]], false)
    h.deps.voice = undefined
    await runTurn(h.deps, h.run().running)
    expect(speech.hold).not.toHaveBeenCalled()
    expect(h.toolCall).not.toHaveBeenCalled()
    expect(model.requests).toHaveLength(2)
    expect(model.requests[1]!.messages.at(-1)).toEqual({ role: 'tool', toolCallId: `c-${KEEP_LISTENING}`, toolName: KEEP_LISTENING, result: { status: 'refused', reason: (NOT_HELD as { reason: string }).reason } })
    expect(h.stored).toHaveLength(1)
    expect(h.stored[0]).toMatchObject({ kind: 'TEXT', body: { text: 'Sure, what next?' } })
    expect(h.stored[0]!.kind === 'TEXT' && h.stored[0]!.body.thinking).toBeFalsy()
  })

  it('beside another call runs the other call alone, through the tool adapter', async () => {
    const { h } = spokenTurn([[hold(), call('list_projects', {}), finish('tool-calls')], [{ type: 'text', text: 'You have two.' }, finish()]], false)
    h.toolCall.mockResolvedValue({ status: 'done', operationId: 'op-read', result: [] })
    await runTurn(h.deps, h.run().running)
    expect(h.toolCall.mock.calls.map(c => (c[1] as { name: string }).name)).toEqual(['list_projects'])
    expect(h.steps.at(-1)?.steps.map(s => s.label)).toEqual(['Looked at your projects'])
  })
})

describe("a spoken message's reasoning @SC-1838", () => {
  it('is least on the first step only; later steps think freely', async () => {
    const { h, model } = spokenTurn([[call('list_projects', {}), finish('tool-calls')], [{ type: 'text', text: 'Two.' }, finish()]])
    h.toolCall.mockResolvedValue({ status: 'done', operationId: 'op-read', result: [] })
    await runTurn(h.deps, h.run().running)
    expect(model.requests[0]).toMatchObject({ spoken: true, firstSpokenStep: true })
    expect(model.requests[1]!.spoken).toBeUndefined()
    expect(model.requests[1]!.firstSpokenStep).toBeUndefined()
  })

  it('without the voice turn block, stays as it was: least on every step of a reply someone hears', async () => {
    const { h, model } = spokenTurn([[call('list_projects', {}), finish('tool-calls')], [{ type: 'text', text: 'Two.' }, finish()]], false)
    h.toolCall.mockResolvedValue({ status: 'done', operationId: 'op-read', result: [] })
    await runTurn(h.deps, h.run().running)
    expect(model.requests.map(r => [r.spoken, r.firstSpokenStep])).toEqual([[true, undefined], [true, undefined]])
  })
})

describe('the keep_listening tool @SC-1830', () => {
  const capability = (trigger?: TurnCapability['trigger']) => ({ trigger }) as TurnCapability

  it('is offered on every turn offered tools while the flag is on, and on none while it is off', async () => {
    const on = createKeepListeningTool({ featureOn: async () => true })
    const off = createKeepListeningTool({ featureOn: async () => false })
    expect(await on.offered(capability('MESSAGE'))).toBe(true)
    expect(await on.offered(capability('CONTINUATION'))).toBe(true)
    expect(await on.offered(capability('REPORT'))).toBe(false)
    expect(await off.offered(capability('MESSAGE'))).toBe(false)
    expect(await on.describe(capability('MESSAGE'))).toBe(KEEP_LISTENING_DESCRIPTION)
    expect(on.input.safeParse({ reason: 'ended on "so"' }).success).toBe(true)
  })

  it('never holds when run: a call that reached the tool adapter is a failed one', async () => {
    expect(await createKeepListeningTool({ featureOn: async () => true }).run(capability('MESSAGE'), { reason: 'x' }, { signal: new AbortController().signal })).toEqual(NOT_HELD)
  })
})
