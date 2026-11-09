/**
 * The listening family, replayed end to end (voice that stays in the conversation, spec §3): a long monologue with a
 * pause every few seconds, through every layer of the voice client. The sounds come at an irregular
 * rhythm of about three a minute, never closer than the shortest gap, none of the last six again, never started over the
 * person, a hum left to finish when they go on; a tier with no clips is silent, and Adaptive voice off plays nothing.
 */
import { describe, expect, it } from 'vitest'
import { CONVERSATION_VOICE_SOCKET as V } from '../../../shared/conversations/protocol'
import { LISTENING_CLIPS, type ListeningTier } from '../orchestration/listeningTiers'
import { VOICE_SETTINGS } from '../settings'
import { script } from '../stt/__tests__/transcribing'
import { C, rig, type Rig } from './sessionRig'

const L = VOICE_SETTINGS.listening

/** hq hands over the listening family's clips of `tiers`, as it makes them as voice starts. */
function clips(r: Rig, tiers: ListeningTier[] = ['hum', 'acknowledge', 'invitation']) {
  for (const tier of tiers) {
    const { use, tier: wire, texts } = LISTENING_CLIPS[tier]
    for (const text of texts(L)) r.receive(V.phrase, { conversationId: C, text, tier: wire, audio: new ArrayBuffer(8), use })
  }
}

/** `minutes` of the person telling something: ten words, then a 1.5 s pause where they seem mid-thought, over and over. */
async function monologue(minutes: number, opts: { adaptiveVoice?: boolean; tiers?: ListeningTier[] } = {}) {
  // A low score at every pause: the rule hears them mid-thought, and the turn never ends.
  // Each ten words end in a full stop, as the speech service punctuates a sentence.
  const r = rig({ turnScores: [0.1], service: { textOf: i => (i % 10 === 9 ? `w${i}.` : `w${i}`) }, deps: { adaptiveVoice: () => opts.adaptiveVoice ?? true } })
  await r.start()
  // A clip is about half a second: the fake playback is idle once that much time has passed since one was enqueued.
  let enqueuedAt = -Infinity
  const enqueue = r.pb.playback.enqueue
  r.pb.playback.enqueue = (...args) => { enqueuedAt = r.clock.now(); return enqueue(...args) }
  r.pb.playback.idle = () => r.clock.now() - enqueuedAt >= 600
  clips(r, opts.tiers)
  const cycles = Math.round((minutes * 60_000) / 4_000)
  await r.hear(script(Array.from({ length: cycles }, () => [10, 1_500] as [number, number]), 8, 300).audio)
  return r
}

/** Each sound started: its text, and when. */
const started = (r: Rig) => {
  const out: Array<{ text: string; t: number }> = []
  let playing = false
  for (const e of r.of('phrase.at')) {
    if (e.playing && !playing) out.push({ text: e.text, t: e.t })
    playing = e.playing
  }
  return out
}

describe('the listening family over a long monologue, replayed @SC-1833', () => {
  it('plays about three a minute at an irregular rhythm, never closer than the shortest gap, and none of the last six again', async () => {
    const minutes = 6
    const r = await monologue(minutes)
    const sounds = started(r)
    expect(sounds.length / minutes).toBeGreaterThanOrEqual(2.5)
    expect(sounds.length / minutes).toBeLessThanOrEqual(4.5)
    const gaps = sounds.slice(1).map((s, i) => s.t - sounds[i]!.t)
    for (const gap of gaps) expect(gap).toBeGreaterThanOrEqual(L.minGapMs)
    // Irregular: the gaps are not all alike.
    expect(Math.max(...gaps) - Math.min(...gaps)).toBeGreaterThan(4_000)
    sounds.forEach((s, i) => expect(sounds.slice(Math.max(0, i - L.recent), i).map(p => p.text)).not.toContain(s.text))
    // The person was telling something: hums and acknowledging words, and no invitation.
    expect(sounds.every(s => [...L.hums, ...L.acknowledging].includes(s.text))).toBe(true)
    expect(sounds[0]!.t - r.of('acoustic.silence').find(e => !e.silent)!.t).toBeGreaterThanOrEqual(L.afterSpeechMs)
    expect(r.sent()).toEqual([])
  }, 60_000)

  it('starts a sound only in a pause, and a sound that began there is not cut when the person goes on', async () => {
    const r = await monologue(2)
    const events = r.events.filter(e => e.kind === 'acoustic.silence' || e.kind === 'phrase.at')
    let silent = true
    let playing = false
    let cut = 0
    for (const e of events) {
      if (e.kind === 'acoustic.silence') {
        silent = e.silent
        continue
      }
      if (e.kind !== 'phrase.at') continue
      if (e.playing && !playing) expect(silent).toBe(true)
      if (!e.playing && playing && !silent) cut++
      playing = e.playing
    }
    expect(started(r).length).toBeGreaterThan(0)
    expect(cut).toBe(0)
  }, 60_000)

  it('plays nothing with the person\'s Adaptive voice off', async () => {
    const r = await monologue(2, { adaptiveVoice: false })
    expect(r.of('orchestration.phrase')).toEqual([])
    expect(r.of('phrase.at')).toEqual([])
  }, 60_000)

  it('is silent where a tier has no clips yet, and plays the tiers that exist', async () => {
    const none = await monologue(2, { tiers: ['invitation'] })
    expect(none.of('orchestration.phrase').length).toBeGreaterThan(0)
    expect(none.of('phrase.at')).toEqual([])
    const hums = await monologue(2, { tiers: ['hum'] })
    expect(started(hums).length).toBeGreaterThan(0)
    expect(started(hums).every(s => L.hums.includes(s.text))).toBe(true)
  }, 60_000)

  it('invites the person to go on once they stopped the reply with a stop word and stayed silent', async () => {
    const r = rig({ service: { textOf: i => ['hold', 'on'][i] ?? `w${i}` } })
    await r.start()
    clips(r)
    r.reply('t1', ['Here is the long answer you asked for.', 'And there is more of it.'])
    await r.advance(500)
    await r.hear(script([[2, 0]], 8, 0).audio)
    await r.silence(L.invitationAfterStopMs + 1_500)
    const stop = r.of('orchestration.playback').find(e => e.action === 'stop')
    expect(stop).toMatchObject({ by: 'stop-word' })
    const invitations = started(r).filter(s => L.invitations.includes(s.text))
    expect(invitations).toHaveLength(1)
    const voiceEnded = r.of('acoustic.silence').filter(e => e.silent).at(-1)!.t
    expect(invitations[0]!.t - voiceEnded).toBeGreaterThanOrEqual(L.invitationAfterStopMs)
    expect(r.sent()).toEqual([])
  }, 60_000)
})
