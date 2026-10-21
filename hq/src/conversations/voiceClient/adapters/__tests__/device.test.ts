import { describe, expect, it } from 'vitest'
import { fakeClock } from '../../clock'
import type { VoiceEventOf } from '../../events'
import { createVoiceRuntime } from '../../runtime/runtime'
import { VOICE_SETTINGS } from '../../settings'
import { describeDevice, outputOf, watchDevice, type DeviceInfo, type MediaDevicesLike } from '../device'

const output = (label: string, deviceId = 'default'): DeviceInfo => ({ kind: 'audiooutput', deviceId, label })

describe('the device check', () => {
  it('tells headphones from speakers by the current output’s name', () => {
    expect(outputOf([output('Default - MacBook Pro Speakers')])).toBe('speakers')
    expect(outputOf([output('Default - AirPods Pro')])).toBe('headphones')
    expect(outputOf([output('External Headphones')])).toBe('headphones')
    expect(outputOf([output('Jabra Evolve2 Headset (Bluetooth)')])).toBe('headphones')
    expect(outputOf([output('HDMI display')])).toBe('unknown')
  })

  it('reads the default output, and says unknown when the browser gives no names', () => {
    expect(outputOf([output('AirPods', 'abc'), output('Default - MacBook Pro Speakers')])).toBe('speakers')
    expect(outputOf([output('')])).toBe('unknown')
    expect(outputOf([{ kind: 'audioinput', deviceId: 'default', label: 'MacBook Pro Microphone' }])).toBe('unknown')
  })

  it('reports what processing was granted, and null where the browser does not say', () => {
    expect(describeDevice({ echoCancellation: true, noiseSuppression: false, sampleRate: 48_000 }, [], 16_000)).toEqual({
      kind: 'acoustic.device', output: 'unknown', sampleRate: 48_000,
      processing: { echoCancellation: true, noiseSuppression: false, autoGainControl: null },
    })
    expect(describeDevice({ echoCancellation: 'all' }, [], 16_000).processing.echoCancellation).toBe(true)
    expect(describeDevice({ echoCancellation: 'none' }, [], 16_000).processing.echoCancellation).toBe(false)
    expect(describeDevice({}, [], 16_000).sampleRate).toBe(16_000)
  })

  it('publishes the device at once and again when the devices change, until stopped', async () => {
    const runtime = createVoiceRuntime({ components: [], adapters: [], settings: VOICE_SETTINGS, clock: fakeClock() })
    const seen: VoiceEventOf<'acoustic.device'>[] = []
    runtime.subscribe(['acoustic.device'], e => seen.push(e as VoiceEventOf<'acoustic.device'>))
    let devices = [output('Default - MacBook Pro Speakers')]
    let listener: (() => void) | null = null
    const media: MediaDevicesLike = {
      enumerateDevices: async () => devices,
      addEventListener: (_, l) => { listener = l },
      removeEventListener: () => { listener = null },
    }
    const stop = watchDevice(runtime, () => ({ echoCancellation: true }), 16_000, media)
    await Promise.resolve(); await Promise.resolve()
    devices = [output('Default - AirPods Pro')]
    listener!()
    await Promise.resolve(); await Promise.resolve()
    expect(seen.map(e => e.output)).toEqual(['speakers', 'headphones'])
    stop()
    expect(listener).toBeNull()
  })
})
