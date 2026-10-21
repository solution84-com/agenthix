/** The messages between the page and the models' worker: the two ports, carried across the thread boundary. */

export type ToModels =
  | { id: number; kind: 'vad.score'; frame: Float32Array }
  | { kind: 'vad.reset' }
  | { id: number; kind: 'turn.score'; audio: Float32Array }

export type FromModels =
  | { id: number; ok: true; score: number }
  | { id: number; ok: false; error: string }
