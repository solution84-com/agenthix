import { describe, expect, it } from 'vitest'
import { fakeClock } from '../../clock'
import { createVoiceRuntime } from '../../runtime/runtime'
import type { VoiceRuntimeHandle } from '../../runtime/types'
import { VOICE_SETTINGS } from '../../settings'
import { mirrorRuntime, watchMirror, type Channel } from '../mirror'

/** Two ends of one channel, delivering at once, as two tabs would. */
function channels() {
  const ends: Channel[] = []
  const open = (): Channel => {
    const end: Channel = {
      onmessage: null,
      postMessage: message => { for (const other of ends) if (other !== end) other.onmessage?.({ data: message } as MessageEvent) },
      close: () => { ends.splice(ends.indexOf(end), 1) },
    }
    ends.push(end)
    return end
  }
  return open
}

function running() {
  const clock = fakeClock()
  const runtime = createVoiceRuntime({ components: [], adapters: [], settings: VOICE_SETTINGS, clock, tickMs: 1_000 })
  runtime.start()
  return { clock, runtime }
}

describe('the voice lab in another tab', () => {
  it('sees a voice that started before it opened, with what happened so far, and every event after', () => {
    const open = channels()
    const { runtime, clock } = running()
    const stop = mirrorRuntime(runtime, open)
    runtime.publish({ kind: 'acoustic.silence', silent: false, t: clock.now() })

    let seen: VoiceRuntimeHandle | null = null
    watchMirror(rt => { seen = rt }, open)
    const lab = seen as unknown as VoiceRuntimeHandle & { log: () => readonly { kind: string }[] }
    expect(lab.settings().version).toBe(VOICE_SETTINGS.version)
    expect(lab.log().map(e => e.kind)).toContain('acoustic.silence')

    const kinds: string[] = []
    lab.subscribe(['stt.utterance'], e => kinds.push(e.text))
    runtime.publish({ kind: 'stt.utterance', text: 'hello', t: clock.now() })
    expect(kinds).toEqual(['hello'])

    stop()
    expect(seen).toBeNull()
  })

  it('leaves the audio out', () => {
    const open = channels()
    const { runtime, clock } = running()
    let seen: (VoiceRuntimeHandle & { log: () => readonly { kind: string }[] }) | null = null
    watchMirror(rt => { seen = rt as typeof seen }, open)
    mirrorRuntime(runtime, open)
    runtime.publish({ kind: 'audio.frame', pcm: new Int16Array(512), t: clock.now() })
    runtime.publish({ kind: 'acoustic.silence', silent: true, t: clock.now() })
    expect(seen!.log().map(e => e.kind)).not.toContain('audio.frame')
  })
})
