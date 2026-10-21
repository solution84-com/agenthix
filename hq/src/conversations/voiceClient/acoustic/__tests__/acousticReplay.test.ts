import { beforeAll, describe, expect, it } from 'vitest'
import { voiceActivity } from '../../adapters/vad'
import { concat, silence } from '../../__tests__/harness/wav'
import { replay } from '../../__tests__/harness/replay'
import { fakeVoiceActivityModel } from '../../models/fakes'
import { said, speechAvailable } from '../../models/__tests__/clips'
import { sileroVad } from '../../models/__tests__/onDisk'
import type { Adapter } from '../../runtime/types'
import { VOICE_SETTINGS } from '../../settings'
import { acousticComponents } from '../index'
import { FRAME, noise, seeded } from './signals'

const toPcm = (audio: Float32Array) => Int16Array.from(audio, s => Math.round(Math.max(-1, Math.min(1, s)) * 32767))
const toFloat = (pcm: Int16Array) => Float32Array.from(pcm, s => s / 32768)

/** Silero's real confidences for every frame of `pcm`, computed ahead, so the replay runs on the fake clock. */
async function scoresOf(pcm: Int16Array): Promise<number[]> {
  const vad = await sileroVad()
  vad.reset()
  const scores: number[] = []
  for (let i = 0; i + FRAME <= pcm.length; i += FRAME) scores.push(await vad.score(toFloat(pcm.subarray(i, i + FRAME))))
  return scores
}

const withRoom = (pcm: Int16Array) => { const room = noise(pcm.length, -66, seeded(2)); return pcm.map((s, i) => s + room[i]!) }

describe('Acoustic, replayed through the runtime', () => {
  describe.runIf(speechAvailable)('a short question in a quiet room, scored by the real Silero VAD (needs macOS `say`)', () => {
    let audio: Int16Array
    let scores: number[]
    let speechMs: number
    beforeAll(async () => {
      const question = toPcm(said('What is the status of the deploy?'))
      speechMs = (question.length / 16_000) * 1000
      audio = withRoom(concat(silence(2_500), question, silence(2_500)))
      scores = await scoresOf(audio)
    })

    it('says silence: no near the start of the speech and silence: yes after it, and labels the room quiet', async () => {
      const result = await replay({ components: acousticComponents(), adapters: [voiceActivity(fakeVoiceActivityModel(scores))], audio })
      const silences = result.of('acoustic.silence')
      expect(silences[0]).toMatchObject({ silent: false })
      expect(silences[0]!.t).toBeGreaterThan(2_400)
      expect(silences[0]!.t).toBeLessThan(2_900)
      const last = silences[silences.length - 1]!
      expect(last.silent).toBe(true)
      expect(last.t).toBeGreaterThan(2_500 + speechMs - 600)
      expect(last.t).toBeLessThan(2_500 + speechMs + 300)
      expect(result.of('acoustic.room').map(e => e.label)).toEqual(['quiet'])
    })
  })

  it('while the agent speaks and its echo comes back loud, goes strict, never says silence: no, and suggests headphones', async () => {
    const random = seeded(4)
    const played = Int16Array.from({ length: 16_000 * 8 }, (_, i) => {
      const syllable = Math.floor(i / 2_400) % 3 === 2 ? 0.05 : 1
      return Math.round(noise(1, -20, random)[0]! * syllable)
    })
    const audio = withRoom(concat(silence(64), played.subarray(0, played.length - 1_024)).map(s => Math.round(s * 0.3)))
    const agent: Adapter = {
      name: 'agent',
      start(runtime) {
        return runtime.subscribe(['audio.frame'], (e) => {
          const n = Math.round(e.t / 32)
          const pcm = played.slice(n * FRAME, (n + 1) * FRAME)
          if (pcm.length === FRAME) runtime.publish({ kind: 'playback.frame', replyId: 'r1', pcm, t: e.t })
          if (n === 1) runtime.publish({ kind: 'playback.at', replyId: 'r1', index: 0, elapsedMs: 0, ended: false, playing: true, t: e.t })
        })
      },
    }
    // Silero is sure the echo is a voice: the worst case the owner's raw recordings show.
    const result = await replay({ components: acousticComponents(), adapters: [voiceActivity(fakeVoiceActivityModel([0.99])), agent], audio, tailMs: 0 })
    expect(result.of('acoustic.detector')[0]!.detector.onThreshold).toBe(VOICE_SETTINGS.detectorWhileAgentSpeaks.onThreshold)
    expect(result.of('acoustic.silence')).toEqual([])
    const echo = result.of('acoustic.echoLevel').map(e => e.level)
    expect(Math.min(...echo.slice(2))).toBeGreaterThan(VOICE_SETTINGS.echo.headphonesAbove)
    expect(result.of('acoustic.advice').map(e => e.advice)).toEqual(['headphones'])
  })
})
