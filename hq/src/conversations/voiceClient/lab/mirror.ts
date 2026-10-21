/**
 * The voice lab in another tab. A tab's voice runtime lives in that tab only, so in development the session mirrors
 * its events over a BroadcastChannel, and the lab builds a read-only runtime handle from them. Audio is left out:
 * the rows need none of it, and a frame every 32 ms would crowd the channel.
 */
import type { VoiceEvent, VoiceEventKind } from '../events'
import type { VoiceRuntimeHandle } from '../runtime/types'
import type { VoiceSettings } from '../settings'

export const LAB_CHANNEL = 'voice-lab'

const LEFT_OUT: ReadonlySet<VoiceEventKind> = new Set(['audio.frame', 'playback.frame', 'reply.audio'])
const LOG_SIZE = 5_000

type Message =
  | { type: 'hello' }
  | { type: 'started'; settings: VoiceSettings; log: VoiceEvent[] }
  | { type: 'event'; event: VoiceEvent }
  | { type: 'stopped' }

export type Channel = {
  postMessage: (message: Message) => void
  onmessage: ((e: MessageEvent<Message>) => void) | null
  close: () => void
}

const openChannel = (): Channel => new BroadcastChannel(LAB_CHANNEL) as unknown as Channel

/** Mirrors a running runtime's events to any lab tab; returns what stops it. */
export function mirrorRuntime(rt: VoiceRuntimeHandle, open: () => Channel = openChannel): () => void {
  const channel = open()
  const log: VoiceEvent[] = []
  const started = () => channel.postMessage({ type: 'started', settings: rt.settings(), log: [...log] })
  const off = rt.subscribe('*', event => {
    if (LEFT_OUT.has(event.kind)) return
    log.push(event as VoiceEvent)
    if (log.length > LOG_SIZE) log.splice(0, log.length - LOG_SIZE)
    channel.postMessage({ type: 'event', event: event as VoiceEvent })
  })
  // A lab opened after voice started asks who is running.
  channel.onmessage = e => { if (e.data.type === 'hello') started() }
  started()
  return () => { off(); channel.postMessage({ type: 'stopped' }); channel.close() }
}

/** A runtime handle fed by another tab's mirror. */
function mirroredHandle(settings: VoiceSettings, seed: VoiceEvent[]) {
  const listeners = new Set<{ kinds: readonly VoiceEventKind[] | '*'; fn: (e: VoiceEvent) => void }>()
  const log = [...seed]
  const handle: VoiceRuntimeHandle & { log: () => readonly VoiceEvent[]; overflows: () => readonly never[] } = {
    publish: () => undefined,
    subscribe: (kinds, fn) => {
      const entry = { kinds, fn: fn as (e: VoiceEvent) => void }
      listeners.add(entry)
      return () => { listeners.delete(entry) }
    },
    settings: () => settings,
    now: () => log.at(-1)?.t ?? 0,
    log: () => log,
    overflows: () => [],
  }
  const deliver = (event: VoiceEvent) => {
    log.push(event)
    if (log.length > LOG_SIZE) log.splice(0, log.length - LOG_SIZE)
    for (const l of listeners) if (l.kinds === '*' || l.kinds.includes(event.kind)) l.fn(event)
  }
  return { handle, deliver }
}

/** Listens for another tab's voice; `onChange` gets its handle when it runs, and null when it stops. */
export function watchMirror(onChange: (rt: VoiceRuntimeHandle | null) => void, open: () => Channel = openChannel): () => void {
  const channel = open()
  let current: ReturnType<typeof mirroredHandle> | null = null
  channel.onmessage = ({ data }) => {
    if (data.type === 'started') {
      current = mirroredHandle(data.settings, data.log)
      onChange(current.handle)
    } else if (data.type === 'event') {
      current?.deliver(data.event)
    } else if (data.type === 'stopped') {
      current = null
      onChange(null)
    }
  }
  channel.postMessage({ type: 'hello' })
  return () => channel.close()
}
