import { describe, expect, it } from 'vitest'
import { fakeClock } from '../../clock'
import type { VoiceEvent } from '../../events'
import { createVoiceRuntime } from '../../runtime/runtime'
import { VOICE_SETTINGS } from '../../settings'
import type { MediaDevicesLike } from '../device'
import { microphone, type Microphone } from '../microphone'

const flush = async () => { for (let i = 0; i < 5; i++) await Promise.resolve() }
const media: MediaDevicesLike = {
  enumerateDevices: async () => [{ kind: 'audiooutput', deviceId: 'default', label: 'Default - MacBook Pro Speakers' }],
  addEventListener: () => undefined,
  removeEventListener: () => undefined,
}

function fakeMicrophone() {
  let push: ((pcm: Int16Array<ArrayBuffer>) => void) | null = null
  let stopped = 0
  const open = async (onAudio: (pcm: Int16Array<ArrayBuffer>) => void): Promise<Microphone> => {
    push = onAudio
    return { stop: () => { stopped++ }, settings: () => ({ echoCancellation: true, noiseSuppression: true, autoGainControl: false }), contextRate: 48_000 }
  }
  return { open, push: (pcm: Int16Array<ArrayBuffer>) => push!(pcm), stopped: () => stopped }
}

describe('the microphone adapter', () => {
  it('publishes the audio as frames, and the device once the microphone is open', async () => {
    const mic = fakeMicrophone()
    const runtime = createVoiceRuntime({ components: [], adapters: [microphone({ open: mic.open, media })], settings: VOICE_SETTINGS, clock: fakeClock() })
    const seen: VoiceEvent[] = []
    runtime.subscribe(['audio.frame', 'acoustic.device'], e => seen.push(e))
    runtime.start()
    await flush()
    mic.push(new Int16Array(1024))
    expect(seen.map(e => e.kind)).toEqual(['acoustic.device', 'audio.frame', 'audio.frame'])
    expect(seen[0]).toMatchObject({ output: 'speakers', sampleRate: 48_000, processing: { autoGainControl: false } })
    runtime.stop()
    expect(mic.stopped()).toBe(1)
  })

  it('closes a microphone that opens after voice has stopped', async () => {
    const mic = fakeMicrophone()
    const runtime = createVoiceRuntime({ components: [], adapters: [microphone({ open: mic.open, media })], settings: VOICE_SETTINGS, clock: fakeClock() })
    runtime.start()
    runtime.stop()
    await flush()
    expect(mic.stopped()).toBe(1)
  })

  it('reports a microphone that could not be opened', async () => {
    const failures: unknown[] = []
    const adapter = microphone({ open: async () => { throw new Error('denied') }, media, failed: e => failures.push(e) })
    const runtime = createVoiceRuntime({ components: [], adapters: [adapter], settings: VOICE_SETTINGS, clock: fakeClock() })
    runtime.start()
    await flush()
    expect(failures).toHaveLength(1)
  })

  it('says when it is open, and hears nothing while the person has muted it', async () => {
    const mic = fakeMicrophone()
    let opened = 0
    const runtime = createVoiceRuntime({
      components: [], adapters: [microphone({ open: mic.open, media, opened: () => { opened++ } })], settings: VOICE_SETTINGS, clock: fakeClock(),
    })
    const frames: VoiceEvent[] = []
    runtime.subscribe(['audio.frame'], e => frames.push(e))
    runtime.start()
    await flush()
    expect(opened).toBe(1)
    runtime.publish({ kind: 'stt.muted', muted: true, t: 0 })
    mic.push(new Int16Array(1024))
    expect(frames).toHaveLength(0)
    runtime.publish({ kind: 'stt.muted', muted: false, t: 0 })
    mic.push(new Int16Array(512))
    expect(frames).toHaveLength(1)
  })
})
