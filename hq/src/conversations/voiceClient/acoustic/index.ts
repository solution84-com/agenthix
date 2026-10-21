/**
 * Acoustic's parts, for the voice session to wire in: the five components (silence detection, the echo check,
 * the room monitor, the Adapter and the headphones advice) and the two adapters (the microphone, with the device
 * check, and Silero VAD). Without a model of its own, the VAD adapter takes the page's shared models' worker when
 * voice starts and gives it back when voice stops.
 */
import { microphone, type MicrophoneDeps } from '../adapters/microphone'
import { voiceActivity } from '../adapters/vad'
import { sharedWorkerModels } from '../models/sharedModels'
import type { VoiceActivityModel } from '../ports'
import type { Adapter, AnyComponent } from '../runtime/types'
import { detectorAdapter } from './adapter'
import { headphonesAdvice } from './advice'
import { echoCheck } from './echoCheck'
import { roomMonitor } from './roomMonitor'
import { silenceDetector } from './silenceDetector'

export type AcousticDeps = {
  /** Silence detection's model; the shared worker's when not given. */
  vad?: VoiceActivityModel
  /** Leaves the microphone out, for a session (or a test) that publishes `audio.frame` itself. */
  microphone?: MicrophoneDeps | false
}

export function acousticComponents(): AnyComponent[] {
  return [silenceDetector, echoCheck, roomMonitor, detectorAdapter, headphonesAdvice]
}

function sharedVoiceActivity(): Adapter {
  return {
    name: 'voiceActivity',
    start(runtime) {
      const models = sharedWorkerModels()
      const stop = voiceActivity(models.vad).start(runtime)
      return () => { stop(); models.release() }
    },
  }
}

export function acousticParts(deps: AcousticDeps = {}): { components: AnyComponent[]; adapters: Adapter[] } {
  const adapters: Adapter[] = []
  if (deps.microphone !== false) adapters.push(microphone(deps.microphone ?? {}))
  adapters.push(deps.vad ? voiceActivity(deps.vad) : sharedVoiceActivity())
  return { components: acousticComponents(), adapters }
}
