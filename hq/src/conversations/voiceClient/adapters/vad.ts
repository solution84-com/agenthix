/**
 * Silence detection's model as the runtime sees it: every `audio.frame` scored by Silero VAD (in the models'
 * worker), and its confidence published as `acoustic.vadScore`, carrying the frame's own `t` so the silence
 * detector and the room monitor can pair it with the frame. The model scores frames strictly in order; if it
 * falls `VAD_MAX_PENDING` frames behind (the worker busy with the turn model), new frames are skipped until it
 * catches up, rather than queued without limit. A frame the model fails on gets no confidence.
 */
import type { VoiceActivityModel } from '../ports'
import type { Adapter } from '../runtime/types'

export const VAD_MAX_PENDING = 16

const toFloat = (pcm: Int16Array) => Float32Array.from(pcm, s => s / 32768)

export function voiceActivity(model: VoiceActivityModel): Adapter & { skipped: () => number } {
  let skipped = 0
  return {
    name: 'voiceActivity',
    skipped: () => skipped,
    start(runtime) {
      let live = true
      let pending = 0
      model.reset()
      const off = runtime.subscribe(['audio.frame'], (event) => {
        if (event.kind !== 'audio.frame') return
        if (pending >= VAD_MAX_PENDING) { skipped++; return }
        pending++
        model.score(toFloat(event.pcm)).then(
          (confidence) => { if (live) runtime.publish({ kind: 'acoustic.vadScore', confidence, t: event.t }) },
          () => undefined,
        ).finally(() => { pending-- })
      })
      return () => { live = false; off() }
    },
  }
}
