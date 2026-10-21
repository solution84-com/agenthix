/**
 * The device check (acoustic spec, §3): which processing the browser actually granted the microphone, and whether
 * the sound goes to headphones or speakers, as far as the device names say. Published as `acoustic.device` when
 * the microphone opens and whenever the devices change. Device names are only given once the microphone is
 * allowed, and not by every browser; without them the output is `unknown`.
 */
import type { VoiceEventBody } from '../events'
import type { VoiceRuntimeHandle } from '../runtime/types'

export type DeviceBody = Extract<VoiceEventBody, { kind: 'acoustic.device' }>

/** What `MediaStreamTrack.getSettings()` gives; newer browsers may report echo cancellation as a mode. */
export type TrackSettings = { echoCancellation?: boolean | string; noiseSuppression?: boolean; autoGainControl?: boolean; sampleRate?: number }

export type DeviceInfo = { kind: string; deviceId: string; label: string }

export type MediaDevicesLike = {
  enumerateDevices: () => Promise<DeviceInfo[]>
  addEventListener: (type: 'devicechange', listener: () => void) => void
  removeEventListener: (type: 'devicechange', listener: () => void) => void
}

const HEADPHONES = /head ?phone|headset|earphone|earbud|\bbuds\b|airpods|hands-free|bluetooth/i
const SPEAKERS = /speaker/i

export function outputOf(devices: readonly DeviceInfo[]): DeviceBody['output'] {
  const outputs = devices.filter(d => d.kind === 'audiooutput')
  const current = outputs.find(d => d.deviceId === 'default') ?? outputs[0]
  if (!current?.label) return 'unknown'
  if (HEADPHONES.test(current.label)) return 'headphones'
  if (SPEAKERS.test(current.label)) return 'speakers'
  return 'unknown'
}

const granted = (value: boolean | string | undefined): boolean | null =>
  typeof value === 'boolean' ? value : typeof value === 'string' ? value !== 'none' : null

export function describeDevice(settings: TrackSettings, devices: readonly DeviceInfo[], contextRate: number): DeviceBody {
  return {
    kind: 'acoustic.device',
    output: outputOf(devices),
    processing: {
      echoCancellation: granted(settings.echoCancellation),
      noiseSuppression: granted(settings.noiseSuppression),
      autoGainControl: granted(settings.autoGainControl),
    },
    sampleRate: settings.sampleRate ?? contextRate,
  }
}

/** Publishes the device now and on every device change; returns what stops it. */
export function watchDevice(
  runtime: VoiceRuntimeHandle, settings: () => TrackSettings, contextRate: number, media: MediaDevicesLike | null,
): () => void {
  let live = true
  const check = async () => {
    const devices = await media?.enumerateDevices().catch(() => []) ?? []
    if (live) runtime.publish({ ...describeDevice(settings(), devices, contextRate), t: runtime.now() })
  }
  void check()
  media?.addEventListener('devicechange', check)
  return () => { live = false; media?.removeEventListener('devicechange', check) }
}
