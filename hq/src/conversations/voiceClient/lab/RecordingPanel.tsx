import { useEffect, useRef, useState } from 'react'
import { Button, Input, StatePill } from '@agenthix/ui'
import { ShowAttention } from '@agenthix/ui/attention'
import { createResampler } from '../resample'
import { createRecorder, RECORDING_RATE, type Finished } from './recorder'
import { encodeWav } from './wav'
import { getUserMedia } from '../../../shared/securePage'

type Clip = { name: string; file: File }
type Live = {
  ctx: AudioContext
  stream: MediaStream
  node: AudioWorkletNode
  recorder: ReturnType<typeof createRecorder>
  startedAt: string
  /** The context's clock when the first microphone audio arrived. */
  t0: number | null
  timers: number[]
}

function save(name: string, data: BlobPart, type: string) {
  const url = URL.createObjectURL(new Blob([data], { type }))
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  URL.revokeObjectURL(url)
}

/** A clip of the agent, as 16 kHz mono samples. */
async function decodeClip(ctx: AudioContext, file: File): Promise<Float32Array> {
  const buffer = await ctx.decodeAudioData(await file.arrayBuffer())
  return createResampler(buffer.sampleRate)(buffer.getChannelData(0).slice())
}

/**
 * Records the microphone after the browser's processing, and what this page plays at the same moment (a clip of
 * the agent, uploaded), and saves both as 16 kHz WAV with a timeline. The recordings are personal data: they are
 * saved to the person's own disk and go nowhere else.
 */
export function RecordingPanel() {
  const [clips, setClips] = useState<Clip[]>([])
  const [name, setName] = useState('scenario')
  const [delay, setDelay] = useState(3)
  const [recording, setRecording] = useState(false)
  const [done, setDone] = useState<Finished | null>(null)
  const [played, setPlayed] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const live = useRef<Live | null>(null)

  useEffect(() => () => { void stop(false) }, [])

  async function start() {
    setError(null)
    setDone(null)
    setPlayed([])
    try {
      const stream = await getUserMedia({
        audio: { channelCount: { ideal: 1 }, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      })
      const ctx = new AudioContext({ sampleRate: RECORDING_RATE })
      await ctx.audioWorklet.addModule('/pcm-processor.js')
      const node = new AudioWorkletNode(ctx, 'pcm-processor')
      const recorder = createRecorder()
      const resample = createResampler(ctx.sampleRate)
      const state: Live = { ctx, stream, node, recorder, startedAt: new Date().toISOString(), t0: null, timers: [] }
      node.port.onmessage = (e: MessageEvent<ArrayBuffer>) => {
        state.t0 ??= ctx.currentTime
        recorder.addMic(resample(new Float32Array(e.data)))
      }
      ctx.createMediaStreamSource(stream).connect(node)
      node.connect(ctx.destination)
      live.current = state
      setRecording(true)
    } catch (e) {
      setError(e instanceof Error ? `Recording could not start: ${e.message}` : 'Recording could not start.')
    }
  }

  async function play(clip: Clip) {
    const state = live.current
    if (!state) return
    try {
      const samples = await decodeClip(state.ctx, clip.file)
      const buffer = state.ctx.createBuffer(1, samples.length, RECORDING_RATE)
      buffer.copyToChannel(new Float32Array(samples), 0)
      const source = state.ctx.createBufferSource()
      source.buffer = buffer
      source.connect(state.ctx.destination)
      // The clip's place on the timeline is the microphone audio kept when it starts.
      state.recorder.addClip(clip.name, state.recorder.position(), samples)
      source.start()
      setPlayed(list => [...list, clip.name])
    } catch {
      setError(`${clip.name} could not be played. Use a WAV, MP3 or M4A file.`)
    }
  }

  function playAfterDelay(clip: Clip) {
    const state = live.current
    if (!state) return
    state.timers.push(window.setTimeout(() => { void play(clip) }, delay * 1000))
  }

  async function stop(keep = true) {
    const state = live.current
    if (!state) return
    live.current = null
    state.timers.forEach(t => window.clearTimeout(t))
    state.node.disconnect()
    state.stream.getTracks().forEach(t => t.stop())
    const settings = state.stream.getAudioTracks?.()[0]?.getSettings() as Record<string, unknown> | undefined
    const latency = (state.ctx as AudioContext & { outputLatency?: number }).outputLatency
    const result = state.recorder.finish({
      startedAt: state.startedAt,
      processing: settings ?? null,
      outputLatencyMs: typeof latency === 'number' ? Math.round(latency * 1000) : null,
    })
    await state.ctx.close().catch(() => undefined)
    setRecording(false)
    if (keep) setDone(result)
  }

  const saveAll = () => {
    if (!done) return
    const base = name.trim().replace(/[^\w-]+/g, '-') || 'scenario'
    save(`${base}-mic.wav`, encodeWav(done.mic, RECORDING_RATE), 'audio/wav')
    save(`${base}-agent.wav`, encodeWav(done.agent, RECORDING_RATE), 'audio/wav')
    save(`${base}-timeline.json`, JSON.stringify(done.timeline, null, 2), 'application/json')
  }

  return (
    <section className="space-y-3 px-4 py-6 lg:px-10" aria-label="Recording">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-heading text-text-primary">Record a scenario</h2>
        <StatePill tone={recording ? 'danger' : 'neutral'}>{recording ? 'Recording' : done ? `Recorded ${(done.timeline.durationMs / 1000).toFixed(1)} s` : 'Not recording'}</StatePill>
      </div>
      <p className="text-body text-text-muted">
        Records the microphone after the browser&apos;s echo cancellation, noise suppression and gain, and any clip of the agent you play below, as
        16 kHz WAV files with a timeline. The files are saved to your own disk and go nowhere else.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-body text-text-muted" htmlFor="recording-name">Name</label>
        <Input id="recording-name" className="max-w-56" value={name} onChange={e => setName(e.target.value)} disabled={recording} />
        {recording
          ? <Button variant="secondary" size="sm" onClick={() => { void stop() }}>Stop</Button>
          : <Button size="sm" onClick={() => { void start() }}>Start recording</Button>}
        <Button variant="secondary" size="sm" onClick={saveAll} disabled={!done}>Save the files</Button>
      </div>
      <div className="space-y-2">
        <label className="flex flex-wrap items-center gap-2 text-body text-text-muted">
          Clips of the agent
          <input type="file" accept="audio/*" multiple className="text-body" aria-label="Clips of the agent"
            onChange={e => { setClips(Array.from(e.target.files ?? [], file => ({ name: file.name, file }))); e.target.value = '' }} />
        </label>
        <label className="flex items-center gap-2 text-body text-text-muted">
          Play after
          <Input type="number" min={0} className="w-20" value={delay} onChange={e => setDelay(Math.max(0, Number(e.target.value) || 0))} />
          seconds
        </label>
        {clips.map(clip => (
          <div key={clip.name} className="flex items-center gap-2">
            <span className="text-body text-text-primary">{clip.name}</span>
            <Button variant="secondary" size="sm" disabled={!recording} onClick={() => playAfterDelay(clip)}>Play after the delay</Button>
            <Button variant="secondary" size="sm" disabled={!recording} onClick={() => { void play(clip) }}>Play now</Button>
          </div>
        ))}
        {played.length > 0 && <p className="text-body text-text-muted">Played: {played.join(', ')}</p>}
      </div>
      <ShowAttention text={error} title="That did not work" onClose={() => setError(null)} />
    </section>
  )
}
