/**
 * The replay mode's microphone, in the shape the voice client's `openMicrophone` has: a recording handed to the
 * client in real time, with the pauses where they were. With an agent recording chosen, that plays through the
 * speakers from the same moment. No mode uses it now (plan task 4c.5): it is kept, with the pacer and the WAV reader,
 * for a later run of the scenarios as audio.
 */
import type { Microphone } from '../../adapters/microphone'
import { createPacer, realClock, type PacerClock } from './pacer'
import type { ReplayStore } from './replayState'
import type { Wav } from './wav'

export const SPEECH_RATE = 16_000

export type ReplayDeps = {
  store: ReplayStore
  /** The chosen recording's samples, by name. */
  load: (name: string) => Promise<Wav>
  /** Plays the agent's recording through the speakers; returns what stops it. */
  playAgent?: (wav: Wav) => () => void
  clock?: PacerClock
  tailMs?: number
}

export function replayMicrophone(deps: ReplayDeps): (onAudio: (pcm: Int16Array<ArrayBuffer>) => void) => Promise<Microphone> {
  const { store } = deps
  return async (onAudio) => {
    const { file, agentFile } = store.get()
    if (!file) {
      store.set({ status: 'error', message: 'Choose a recording first.' })
      throw new Error('No recording chosen')
    }
    store.set({ status: 'loading', message: '', positionMs: 0 })
    let wav: Wav
    let agent: Wav | null = null
    try {
      wav = await deps.load(file)
      if (wav.rate !== SPEECH_RATE) throw new Error(`${file} is ${wav.rate} Hz; the microphone is 16 kHz`)
      if (agentFile && deps.playAgent) agent = await deps.load(agentFile)
    } catch (err) {
      store.set({ status: 'error', message: err instanceof Error ? err.message : String(err) })
      throw err
    }
    let stopAgent: (() => void) | null = null
    const pacer = createPacer({
      clock: deps.clock ?? realClock, pcm: wav.pcm, rate: wav.rate, tailMs: deps.tailMs,
      onChunk: (pcm) => {
        onAudio(pcm)
        store.set({ positionMs: pacer.position().ms })
      },
      onEnd: () => store.set({ status: 'finished', positionMs: pacer.position().totalMs }),
    })
    store.set({ status: 'playing', totalMs: pacer.position().totalMs, message: '' })
    pacer.start()
    if (agent && deps.playAgent) stopAgent = deps.playAgent(agent)
    return {
      contextRate: SPEECH_RATE,
      settings: () => ({}),
      stop() {
        const was = store.get().status
        pacer.stop()
        stopAgent?.()
        stopAgent = null
        if (was === 'playing') store.set({ status: 'stopped' })
      },
    }
  }
}
