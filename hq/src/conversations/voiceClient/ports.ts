/**
 * The outside services voice's adapters wrap (adaptive voice spec, How it is built and tested): the speech service
 * and the two models on the device. Each has a real implementation and a fake for tests; nothing else in voice
 * knows which it has.
 */

import type { VoiceProfile } from './tone/voiceProfile'

/** A word as the speech service times it: ms into the audio sent on one connection. */
export type ServiceWord = { text: string; start: number; end: number }

export type SpeechToTextHandlers = {
  /** `committed`: the service has finished this turn's text and will not change it. */
  onWords: (text: string, words: ServiceWord[], committed: boolean, order: number | null) => void
  /** The connection closed without being asked to. */
  onClose: (reason: string) => void
  onError: (message: string) => void
  /** How the person sounds (Inworld's voice profile, when asked for): `final`, it came on a final transcript. */
  onVoiceProfile?: (profile: VoiceProfile, final: boolean) => void
}

export type SpeechToTextConnection = {
  /** 16 kHz mono PCM16, sent as it is spoken. */
  send: (pcm: Int16Array) => void
  /** Audio handed to the connection that has not yet gone out, in ms. */
  bufferedMs: () => number
  /** Asks the service to finish the turn it is hearing now. */
  endTurn: () => void
  close: () => void
}

export type SpeechToText = {
  connect: (handlers: SpeechToTextHandlers) => Promise<SpeechToTextConnection>
}

/** Silence detection's model: one 32 ms frame (512 samples at 16 kHz) in, the confidence that it holds a voice out. */
export type VoiceActivityModel = {
  score: (frame: Float32Array) => Promise<number>
  /** Forgets what it has heard: a new stream starts. */
  reset: () => void
}

/** The turn model: up to the last 8 s of the person's audio at 16 kHz in, the score that their turn is finished out. */
export type TurnModel = {
  score: (audio: Float32Array) => Promise<number>
}
