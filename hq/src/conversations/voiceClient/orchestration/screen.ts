/**
 * What Orchestration and the speech connection show on screen (adaptive voice spec, Orchestration §4 and the
 * runtime's *When a service is slow or down*): a raised hand chimes once and puts a badge on the voice pill until it
 * is invited; "Reconnecting…" shows while the speech connection is being replaced. An adapter: it writes the voice
 * snapshot and plays the chime, and decides nothing.
 */
import type { Adapter } from '../runtime/types'
import type { VoiceSnapshot } from '../voiceSnapshot'

export type ScreenDeps = {
  set: (patch: Partial<VoiceSnapshot>) => void
  /** The soft chime (`playChime` in `../playback`). */
  chime: () => void
}

export function screenFeed(deps: ScreenDeps): Adapter {
  return {
    name: 'screen',
    start(runtime) {
      let raised: string | null = null
      const offs = [
        runtime.subscribe(['orchestration.handRaise'], e => {
          if (e.kind !== 'orchestration.handRaise') return
          if (e.state === 'raised') {
            raised = e.updateId
            deps.set({ handRaise: { updateId: e.updateId, critical: e.critical } })
            deps.chime()
          } else if (e.updateId === raised) {
            raised = null
            deps.set({ handRaise: null })
          }
        }),
        runtime.subscribe(['stt.status'], e => {
          if (e.kind === 'stt.status') deps.set({ reconnecting: e.state === 'reconnecting' })
        }),
      ]
      return () => {
        for (const off of offs) off()
        if (raised) deps.set({ handRaise: null })
      }
    },
  }
}
