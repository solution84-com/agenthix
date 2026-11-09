/** Plays a recording through the speakers, as the agent's own voice. */
import type { Wav } from './wav'

export function playThroughSpeakers(wav: Wav): () => void {
  const ctx = new AudioContext({ sampleRate: wav.rate })
  const buffer = ctx.createBuffer(1, wav.pcm.length, wav.rate)
  const channel = buffer.getChannelData(0)
  for (let i = 0; i < wav.pcm.length; i++) channel[i] = wav.pcm[i]! / 0x8000
  const source = ctx.createBufferSource()
  source.buffer = buffer
  source.connect(ctx.destination)
  void ctx.resume().then(() => source.start())
  return () => {
    try { source.stop() } catch { /* not started */ }
    void ctx.close().catch(() => undefined)
  }
}
