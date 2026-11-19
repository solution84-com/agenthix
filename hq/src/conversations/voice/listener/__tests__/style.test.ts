/**
 * The light model's line tone and the listening style (spec §The light model → *Its tone*; §The heavy model → *The
 * listening style as an action*): each line carries an optional `tone`, one of six, calm when absent or anything else;
 * the light model no longer sets a style (a request about how it listens is handed over), and the reply's
 * `set_listening_style` reaches the page as `listened` with the style and the latest call's `seq`.
 */
import { describe, expect, it } from 'vitest'
import type { TurnCapability } from '../../../contract'
import { createListeningStyleTool } from '../../../coordinator/listeningStyle'
import { SET_LISTENING_STYLE, listeningStyleDefinition } from '../../../lead/listeningStyle'
import { buildListenerCall, LISTENER_INSTRUCTIONS_VERSION, listenerToolInputs, LISTENER_SETTINGS, parseListenerResponse, type ListenerInput } from '..'
import { json as obj, rig } from '../../listening/__tests__/listenRig'

const json = (o: object) => ({ text: JSON.stringify(o), calls: [] })
const done = { mode: 'json' as const, soundsFinished: true }

describe('a line\'s tone @SC-2236', () => {
  it('is read on every spoken choice, in both formats; calm is no field', () => {
    expect(parseListenerResponse(json({ action: 'acknowledge', say: 'Oh no.', tone: 'gentle' }), done)).toEqual({ tool: 'acknowledge', say: 'Oh no.', tone: 'gentle' })
    expect(parseListenerResponse(json({ action: 'hand_over', asked: 'x', hold: 'One moment.', tone: 'bright' }), done)).toMatchObject({ tool: 'hand_over', tone: 'bright' })
    expect(parseListenerResponse({ text: '', calls: [{ name: 'invite', input: { say: 'Go on.', tone: 'warm' } }] }, { mode: 'tools', soundsFinished: true }))
      .toEqual({ tool: 'invite', say: 'Go on.', tone: 'warm' })
    expect(parseListenerResponse(json({ action: 'close_turn', say: 'Bye.', tone: 'calm' }), done)).toEqual({ tool: 'close_turn', say: 'Bye.' })
  })

  it('absent or one it does not know is calm', () => {
    expect(parseListenerResponse(json({ action: 'close_turn', say: 'Sure.' }), done)).toEqual({ tool: 'close_turn', say: 'Sure.' })
    expect(parseListenerResponse(json({ action: 'close_turn', say: 'Sure.', tone: 'furious' }), done)).toEqual({ tool: 'close_turn', say: 'Sure.' })
    expect(parseListenerResponse(json({ action: 'close_turn', say: 'Sure.', tone: 3 }), done)).toEqual({ tool: 'close_turn', say: 'Sure.' })
  })

  it('is an optional field of every tool that speaks', () => {
    const inputs = listenerToolInputs(LISTENER_SETTINGS.caps, { withAnswer: true })
    for (const tool of ['acknowledge', 'invite', 'close_turn', 'hand_over'] as const) expect(Object.keys(inputs[tool].shape)).toContain('tone')
    expect(Object.keys(inputs.keep_listening.shape)).toEqual([])
  })

  it('is spoken with the line: hq hears the decision\'s tone', async () => {
    const r = rig([obj({ action: 'acknowledge', say: 'Oh no.', tone: 'gentle' }), obj({ action: 'close_turn', say: 'Bye.' })])
    await r.call({ seq: 1, moment: 'quiet', text: 'and then my phone broke', quietMs: 12_000 })
    await r.call({ seq: 2, moment: 'soundsFinished', text: 'Okay, bye.' })
    expect(r.spoken).toEqual([{ text: 'Oh no.', tone: 'gentle' }, { text: 'Bye.' }])
  })
})

describe('the light model sets no style @SC-2232', () => {
  it('a style it still sends is ignored, and hq\'s answer carries none', async () => {
    expect(parseListenerResponse(json({ action: 'close_turn', say: "Sure, I'll stay quiet.", style: 'hums_off' }), done)).toEqual({ tool: 'close_turn', say: "Sure, I'll stay quiet." })
    const r = rig([obj({ action: 'hand_over', asked: 'stop humming', hold: 'Okay, one moment.', style: 'hums_off' })])
    await r.call({ seq: 1, moment: 'soundsFinished', text: 'Could you stop humming?' })
    expect(r.sent[0]).toMatchObject({ seq: 1, turn: 'handedOver' })
    expect(r.sent[0]).not.toHaveProperty('style')
  })

  it('its instructions, version 18, say a request about how it listens is handed over, and ask for a tone', () => {
    const base: ListenerInput = {
      agent: 'Kernel', person: 'Sam', messageSoFar: 'Stop humming.', moment: { kind: 'soundsFinished' }, recap: null,
      exchanges: [], recentLines: [], thisTurn: [],
    }
    const call = buildListenerCall(base, {})
    expect(LISTENER_INSTRUCTIONS_VERSION).toBe(18)
    expect(call.system).not.toMatch(/hums_off|"style"/)
    expect(call.system).toMatch(/or to listen \("stop humming", "let me finish"\): the other part changes that/)
    expect(call.system).toContain('"tone": "<tone>"')
    expect(call.system).toMatch(/calm, the default/)
    expect(call.user).not.toMatch(/from their voice/)
    expect(buildListenerCall({ ...base, voiceHint: 'sounds sad' }, {}).user).toContain('How Sam sounds, from their voice: sounds sad. Weigh it with their words.')
  })
})

describe('the reply\'s set_listening_style @SC-2232', () => {
  const capability = { conversationId: 'c1', turnId: 't1', actingUserId: 'u1', trigger: 'MESSAGE' } as TurnCapability

  it('is sent to the page as `listened` with the style and the latest call\'s seq, deciding nothing else', async () => {
    const r = rig([obj({ action: 'hand_over', asked: 'stop humming', hold: 'One moment.' })])
    await r.call({ seq: 4, moment: 'soundsFinished', text: 'Could you stop humming?' })
    r.listening.style(r.session, 'hums_off')
    expect(r.sent.at(-1)).toEqual({ conversationId: 'c1', seq: 4, action: 'keep_listening', nextCheckSecs: expect.any(Number), style: 'hums_off' })
  })

  it('before any call, it carries seq 0', () => {
    const r = rig([])
    r.listening.style(r.session, 'patient')
    expect(r.sent[0]).toMatchObject({ seq: 0, style: 'patient' })
  })

  it('as a tool: offered with the flag (not to a report), done for the person holding voice, refused otherwise', async () => {
    const sentTo: string[] = []
    const tool = createListeningStyleTool({
      featureOn: async () => true,
      send: (conversationId, userId, style) => { if (userId !== 'u1') return false; sentTo.push(`${conversationId} ${style}`); return true },
    })
    expect(tool.name).toBe(SET_LISTENING_STYLE)
    expect(listeningStyleDefinition().name).toBe(SET_LISTENING_STYLE)
    expect(await tool.offered(capability)).toBe(true)
    expect(await tool.offered({ ...capability, trigger: 'REPORT' })).toBe(false)
    expect(await tool.run(capability, { style: 'hums_fewer' }, { signal: new AbortController().signal })).toMatchObject({ status: 'done', result: { style: 'hums_fewer' } })
    expect(sentTo).toEqual(['c1 hums_fewer'])
    expect(await tool.run({ ...capability, actingUserId: 'u2' }, { style: 'patient' }, { signal: new AbortController().signal })).toMatchObject({ status: 'refused' })
    expect(await tool.run(capability, { style: 'loud' }, { signal: new AbortController().signal })).toMatchObject({ status: 'refused' })
    const off = createListeningStyleTool({ featureOn: async () => false, send: () => true })
    expect(await off.offered(capability)).toBe(false)
  })
})
