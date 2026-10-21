import { useEffect, useRef, useState } from 'react'
import type { VoiceEvent } from '../events'
import type { Overflow, VoiceRuntimeHandle } from '../runtime/types'
import { initialLab, reduceLab, type LabState } from './rows'

const FLUSH_MS = 150
const KEEP_EVENTS = 5_000

/** The running runtime also keeps a log and its overflows (`VoiceRuntime`); the handle's type does not promise them. */
type MaybeFull = VoiceRuntimeHandle & { log?: () => readonly VoiceEvent[]; overflows?: () => readonly Overflow[] }

export type LabFeed = {
  state: LabState
  events: readonly VoiceEvent[]
  overflows: readonly Overflow[]
  settingsVersion: number | null
}

/** Subscribes to every event of a runtime and folds them into the rows, redrawing a few times a second. */
export function useLabFeed(runtime: VoiceRuntimeHandle | null): LabFeed {
  const [, redraw] = useState(0)
  const feed = useRef<LabFeed>({ state: initialLab(), events: [], overflows: [], settingsVersion: null })

  useEffect(() => {
    if (!runtime) { feed.current = { state: initialLab(), events: [], overflows: [], settingsVersion: null }; redraw(n => n + 1); return }
    const full = runtime as MaybeFull
    const settings = runtime.settings()
    const seeded = [...(full.log?.() ?? [])]
    let state = seeded.reduce(reduceLab, initialLab(settings.detector))
    let events: VoiceEvent[] = seeded
    const refresh = () => {
      feed.current = { state, events, overflows: full.overflows?.() ?? [], settingsVersion: settings.version }
      redraw(n => n + 1)
    }
    const off = runtime.subscribe('*', event => {
      state = reduceLab(state, event)
      events.push(event)
      if (events.length > KEEP_EVENTS) events = events.slice(events.length - KEEP_EVENTS)
    })
    refresh()
    const timer = setInterval(refresh, FLUSH_MS)
    return () => { off(); clearInterval(timer) }
  }, [runtime])

  return feed.current
}
