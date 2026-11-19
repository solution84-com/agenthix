/**
 * The light model's calls as the playground's Log sees them (plan task 5.3): hq's own listening call, its deps wrapped,
 * each call told with its choice, words, `answer`, `asked`, hq's next check, time, and whether it was stale, superseded or
 * over its limit; each turn's outcome; each line played. Fakes only for the model and the outside world.
 */
import { describe, expect, it } from 'vitest'
import type { VoiceListenedEvent } from '@agenthix/core'
import type { LightCallRow, LightLineRow, LightTurnRow } from '../../../../../shared/voicePlaygroundLight'
import { listenerSettingsWith } from '../../../listener'
import type { ListeningDeps, ListeningSession } from '../../../listening/listen'
import { recordedListening } from '../recorder'
import { ACCESS, json, scriptedModel, userText, type Answer } from './fakes'

function rig(rules: [RegExp, Answer][], change = {}, on = true) {
  const calls: LightCallRow[] = []
  const turns: LightTurnRow[] = []
  const lines: LightLineRow[] = []
  const sent: VoiceListenedEvent[] = []
  const logs: string[] = []
  const admitted: string[] = []
  const timers: (() => void)[] = []
  let n = 0
  const model = scriptedModel(rules)
  const deps: ListeningDeps = {
    settings: listenerSettingsWith(change),
    enabled: async () => on,
    access: async () => ACCESS,
    model,
    context: async () => ({ agent: 'Kernel', person: 'Sam', recap: null, exchanges: [] }),
    admit: async (_s, text) => { admitted.push(text) },
    closeTurn: async () => 'turn-1',
    speak: () => `line-${n++}`,
    speakStored: async (_s, _avoid, pool) => ({ lineId: `line-${n++}`, text: pool === 'closing' ? "I'll be here when you're ready." : 'Okay, bear with me.' }),
    send: (_s, e) => { sent.push(e) },
    now: () => Date.now(),
    later: (_ms, fn) => { timers.push(fn); return () => undefined },
    log: line => logs.push(line),
  }
  const listening = recordedListening(deps, { call: r => calls.push(r), turn: r => turns.push(r), line: r => lines.push(r) }, () => `row-${n++}`)
  const session: ListeningSession = { conversationId: 'c1', holderId: 'u1' }
  return { listening, session, calls, turns, lines, sent, logs, admitted, timers, model }
}

const handOver = json({ action: 'hand_over', asked: 'the weather in Melbourne', answer: 'Sunny, 24 degrees.', hold: 'Let me check the Melbourne forecast.', next_check: 3 })

describe('the light model in the playground: each call recorded @SC-1840 @SC-2224', () => {
  it('tells a hand over with its answer, asked, hold and hq\'s next check, and the turn handed over', async () => {
    const r = rig([[/Melbourne/, handOver]])
    await r.listening.listen(r.session, { seq: 1, moment: 'soundsFinished', text: "What's the weather in Melbourne?", quietMs: 600 })
    expect(r.calls).toEqual([expect.objectContaining({
      seq: 1, moment: 'soundsFinished', message: "What's the weather in Melbourne?", choice: 'hand_over',
      words: 'Let me check the Melbourne forecast.', answer: 'Sunny, 24 degrees.', asked: 'the weather in Melbourne', nextCheck: 4,
      stale: false, superseded: false, overLimit: false, failed: false, inputTokens: 1200, outputTokens: 30,
    })])
    expect(r.turns).toEqual([expect.objectContaining({ seq: 1, outcome: 'handedOver', say: 'Let me check the Melbourne forecast.' })])
    expect(r.admitted).toEqual(["What's the weather in Melbourne?"])
    // The answer reaches the page's row, never the browser's answer nor hq's log.
    expect(JSON.stringify(r.sent)).not.toMatch(/Sunny/)
    expect(r.logs.join('\n')).not.toMatch(/Sunny/)
  })

  it('tells a closed turn, a "not yet" and an older page\'s pause, where a hum a model still sends is keep_listening', async () => {
    const r = rig([
      [/Great, thanks/, json({ action: 'close_turn', say: "You're welcome.", next_check: 2 })],
      [/a minute/, json({ action: 'keep_listening', next_check: 20 })],
      [/numbers for the/, json({ action: 'hum', say: 'Mm-hm.', next_check: 2 })],
    ])
    await r.listening.listen(r.session, { seq: 1, moment: 'quietAfterWords', text: 'So the numbers for the', quietMs: 400 })
    await r.listening.listen(r.session, { seq: 2, moment: 'soundsFinished', text: 'Great, thanks.', quietMs: 500 })
    await r.listening.listen(r.session, { seq: 3, moment: 'soundsFinished', text: 'Give me a minute.', quietMs: 500 })
    expect(r.calls.map(c => [c.choice, c.words])).toEqual([['keep_listening', null], ['close_turn', "You're welcome."], ['keep_listening', null]])
    // The next check is hq's schedule, not the light model's: at 5 s of quiet, counted from the quiet each call came at.
    for (const c of r.calls) expect(c.nextCheck!).toBeGreaterThan(4.3)
    for (const c of r.calls) expect(c.nextCheck!).toBeLessThanOrEqual(4.6)
    expect(r.turns.map(t => [t.seq, t.outcome, t.say])).toEqual([[2, 'closed', "You're welcome."], [3, 'notYet', null]])
  })

  it('tells the fallback with its stored phrase, and the bound reached by its own timer outside any call', async () => {
    const r = rig([[/slow/, { delayMs: 200, text: handOver }], [/a minute/, json({ action: 'keep_listening', next_check: 20 })]], { soundsFinishedTimeoutMs: 500 })
    await r.listening.listen(r.session, { seq: 1, moment: 'soundsFinished', text: 'Give me a minute.', quietMs: 500 })
    r.timers[0]!()
    await new Promise(res => setTimeout(res, 0))
    expect(r.turns.map(t => [t.seq, t.outcome, t.say])).toEqual([[1, 'notYet', null], [null, 'fallback', 'Okay, bear with me.']])
    expect(r.admitted).toEqual(['Give me a minute.'])
  })

  it('marks a call over its time limit, which falls back on a sounds finished call', async () => {
    const r = rig([[/slow/, { delayMs: 2_000, text: handOver }]], { soundsFinishedTimeoutMs: 500 })
    await r.listening.listen(r.session, { seq: 1, moment: 'soundsFinished', text: 'A slow one.', quietMs: 500 })
    expect(r.calls[0]).toMatchObject({ choice: null, overLimit: true, superseded: false, failed: false })
    expect(r.turns).toEqual([expect.objectContaining({ outcome: 'fallback', say: 'Okay, bear with me.' })])
  })

  it('marks a call a newer one stopped as superseded, and a late hum as stale', async () => {
    const r = rig([[/first/, { delayMs: 300, text: json({ action: 'hum', say: 'Mm.', next_check: 2 }) }]])
    const first = r.listening.listen(r.session, { seq: 1, moment: 'quietAfterWords', text: 'The first', quietMs: 400 })
    await new Promise(res => setTimeout(res, 20))
    await r.listening.listen(r.session, { seq: 2, moment: 'quietAfterWords', text: 'The second', quietMs: 400 })
    await first
    const one = r.calls.find(c => c.seq === 1)!
    expect(one).toMatchObject({ superseded: true, stale: false, choice: null })
  })

  it('tells a line played to its end, once, and an off answer that carried a message', async () => {
    const r = rig([[/thanks/, json({ action: 'close_turn', say: 'Any time.', next_check: 2 })]])
    await r.listening.listen(r.session, { seq: 1, moment: 'soundsFinished', text: 'Okay thanks.', quietMs: 500 })
    const lineId = r.sent[0]!.lineId!
    r.listening.played(r.session, lineId)
    r.listening.played(r.session, lineId)
    expect(r.lines).toEqual([expect.objectContaining({ lineId, text: 'Any time.', stored: false })])
  })

  it('with the light model off, tells no call, and a message the call carried as handed over plainly', async () => {
    const r = rig([], {}, false)
    await r.listening.listen(r.session, { seq: 1, moment: 'quietAfterWords', text: 'So', quietMs: 400 })
    await r.listening.listen(r.session, { seq: 2, moment: 'soundsFinished', text: 'So what now?', quietMs: 500 })
    expect(r.calls).toEqual([])
    expect(r.turns.map(t => [t.seq, t.outcome])).toEqual([[2, 'off']])
    expect(r.admitted).toEqual(['So what now?'])
  })

  it('carries its own checks in this pause into each call, as hq does', async () => {
    const r = rig([])
    const text = 'I was thinking we could maybe move the meeting to'
    await r.listening.listen(r.session, { seq: 1, moment: 'soundsFinished', text, quietMs: 700 })
    await r.listening.listen(r.session, { seq: 2, moment: 'quiet', keptOpen: true, text, quietMs: 2700 })
    expect(userText(r.model.requests[0]!)).not.toContain('you have been asked')
    expect(userText(r.model.requests[1]!)).toContain('asked once, and nothing new came: keep_listening at 0.7 s of quiet.')
  })

  it('tells hq\'s own call at the limit as a call of its own, and the turn its line closed', async () => {
    const text = 'I was thinking we could maybe move the meeting to'
    const r = rig([
      [/reached its limit/, json({ action: 'close_turn', say: 'Okay, just say when.', next_check: 2 })],
      [/meeting/, json({ action: 'invite', say: 'Move it to…?', next_check: 15 })],
    ])
    await r.listening.listen(r.session, { seq: 1, moment: 'soundsFinished', text, quietMs: 700 })
    r.timers[0]!()
    await new Promise(res => setTimeout(res, 0))
    expect(r.calls.map(c => [c.seq, c.moment, c.choice, c.words, c.message])).toEqual([
      [1, 'soundsFinished', 'invite', 'Move it to…?', text], [1, 'limit', 'close_turn', 'Okay, just say when.', text],
    ])
    expect(r.turns.map(t => [t.seq, t.outcome, t.say])).toEqual([[1, 'notYet', 'Move it to…?'], [1, 'closed', 'Okay, just say when.']])
    expect(r.admitted).toEqual([])
  })

  it('tells a stored closing line at the limit as SYSTEM\'s, the light model having given none', async () => {
    const r = rig([[/reached its limit/, json({ action: 'keep_listening', next_check: 2 })], [/meeting/, json({ action: 'invite', say: 'Move it to…?', next_check: 15 })]])
    await r.listening.listen(r.session, { seq: 1, moment: 'soundsFinished', text: 'Move the meeting to', quietMs: 700 })
    await r.listening.listen(r.session, { seq: 2, moment: 'quiet', keptOpen: true, text: '', quietMs: 60_000 })
    expect(r.calls.map(c => [c.seq, c.moment, c.choice])).toEqual([[1, 'soundsFinished', 'invite'], [2, 'limit', 'keep_listening']])
    expect(r.turns.map(t => [t.seq, t.outcome, t.say])).toEqual([[1, 'notYet', 'Move it to…?'], [2, 'limitClosed', "I'll be here when you're ready."]])
  })
})
