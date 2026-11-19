/**
 * The runtime voice runs on while it is on: every layer's parts in one list (adaptive voice spec, The real-time
 * runtime). The components run in this order for each event: Acoustic's, then STT's echo filter, then
 * Orchestration's (the floor, barge-in, the scheduler, the hand-raise), then what the person is saying, then
 * Semantics' pause timer. The adapters are the microphone and the voice activity model, the speech connection,
 * the turn model, the speaker, and hq's socket and the screen.
 *
 * The microphone is opened by Acoustic's adapter only; the speech connection reads its `audio.frame` events. The
 * two models share one worker (`models/sharedModels`), taken when voice starts and given back when it stops.
 */
import { acousticParts } from './acoustic'
import type { MediaDevicesLike } from './adapters/device'
import type { LooseSocket } from './adapters/hqSocket'
import type { Microphone } from './adapters/microphone'
import type { Clock } from './clock'
import { orchestrationParts } from './orchestration'
import type { SpeechToText, TurnModel, VoiceActivityModel } from './ports'
import { createVoiceRuntime } from './runtime/runtime'
import type { Adapter, VoiceRuntime } from './runtime/types'
import { semanticsParts } from './semantics'
import { VOICE_SETTINGS, type VoiceSettings } from './settings'
import { speechService, sttParts, type SttToken } from './stt'
import { meteredService, type SpeechReport } from './stt/meter'
import { utterance } from './stt/utterance'
import type { VoiceSnapshot } from './voiceSnapshot'

/** What reaches outside the page; each has the real one by default, and a test gives its own. */
export type VoiceOutside = {
  /** Opens the microphone, as `openMicrophone` does. */
  openMicrophone?: (onAudio: (pcm: Int16Array<ArrayBuffer>) => void) => Promise<Microphone>
  media?: MediaDevicesLike | null
  /** The speech service on one of hq's tokens. */
  speechService?: (token: SttToken, settings: VoiceSettings) => SpeechToText
  /** Silence detection's model and the turn model; the shared worker's when not given. */
  models?: { vad: VoiceActivityModel; turn: TurnModel }
  settings?: VoiceSettings
}

export type VoicePartsDeps = VoiceOutside & {
  clock: Clock
  socket: LooseSocket
  conversationId: () => string | null
  getToken: () => Promise<SttToken>
  /** Told what each speech connection streamed, for the ledger. */
  reportSpeech?: SpeechReport
  set: (patch: Partial<VoiceSnapshot>) => void
  chime: () => void
  speaker: Adapter
  /** What the person said joins a message whose reply has not started: it goes as a message of its own. */
  sendNew: (text: string, trailedOff?: boolean) => void
  /** The microphone is open. */
  opened: () => void
  /** The microphone could not be opened. */
  microphoneFailed: (err: unknown) => void
  /** Speech to text could not be kept up. */
  sttFailed: (message: string) => void
}

export function createVoiceParts(deps: VoicePartsDeps): VoiceRuntime {
  const acoustic = acousticParts({
    vad: deps.models?.vad,
    microphone: { open: deps.openMicrophone, media: deps.media, opened: deps.opened, failed: deps.microphoneFailed },
  })
  const stt = sttParts({ clock: deps.clock, getToken: deps.getToken, service: meteredService(deps.speechService ?? speechService, deps.reportSpeech), failed: deps.sttFailed })
  const semantics = semanticsParts({ model: deps.models?.turn })
  const orchestration = orchestrationParts({
    socket: deps.socket, conversationId: deps.conversationId, sendNew: deps.sendNew, set: deps.set, chime: deps.chime,
  })
  return createVoiceRuntime({
    components: [...acoustic.components, ...stt.components, ...orchestration.components, utterance, ...semantics.components],
    adapters: [...acoustic.adapters, ...stt.adapters, ...semantics.adapters, deps.speaker, ...orchestration.adapters],
    settings: deps.settings ?? VOICE_SETTINGS,
    clock: deps.clock,
  })
}
