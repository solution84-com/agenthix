/**
 * The Log's turns, from everything the page holds: the page's own voice events (`pageTrail.ts`, read from each voice
 * runtime as it runs, cleared with the conversation), the server's rows and the conversation's entries.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { VOICE_PLAYGROUND_SOCKET as P } from '../../../shared/voicePlayground'
import type { VoiceRuntimeHandle } from '../runtime/types'
import type { LooseSocket } from '../voiceSession'
import { decisionRows } from './decisions'
import { lightSteps } from './lightSteps'
import { logTurns, type LogView } from './logTurns'
import { backchannelSteps, heavySteps, noteSteps, soundSteps, typedSteps } from './otherSteps'
import { toneSteps } from './toneSteps'
import { createTrailReader, emptyTrail, type PageTrail } from './pageTrail'
import { paceSteps } from './paceSteps'
import type { LightFeed } from './useLightFeed'
import type { PlaygroundFeed } from './usePlaygroundFeed'

/** The trail, changed in place, and a number that moves each time it changes. */
export function usePageTrail(runtime: VoiceRuntimeHandle | null, socket: LooseSocket): { trail: PageTrail; version: number } {
  const trail = useRef<PageTrail>(emptyTrail())
  const [version, setVersion] = useState(0)
  useEffect(() => {
    if (!runtime) return
    const read = createTrailReader(trail.current, Date.now, runtime.settings().pause.capMs)
    return runtime.subscribe('*', event => { if (read(event)) setVersion(v => v + 1) })
  }, [runtime])
  useEffect(() => {
    const cleared = () => { Object.assign(trail.current, emptyTrail()); setVersion(v => v + 1) }
    socket.on(P.cleared, cleared)
    return () => socket.off(P.cleared, cleared)
  }, [socket])
  return { trail: trail.current, version }
}

/** Everything the Log shows, as turns. */
export function buildLogView(feed: Pick<PlaygroundFeed, 'entries' | 'decisions' | 'calls' | 'notes'>, light: LightFeed, trail: PageTrail, labelOf: (model: string) => string): LogView {
  const rows = decisionRows(feed.entries, feed.decisions)
  return logTurns({
    steps: [
      ...lightSteps(light.calls, light.turns, light.lines, trail),
      ...soundSteps(trail),
      ...typedSteps(feed.entries, trail.words.length === 0),
      ...heavySteps(feed.entries, rows, feed.calls, light.recaps, trail, labelOf),
      ...backchannelSteps(trail),
      ...paceSteps(trail),
      ...toneSteps(trail),
      ...noteSteps(feed.notes),
    ],
    words: trail.words,
    speechStarts: trail.speechStarts,
    stops: trail.stops,
    messages: feed.entries.filter(e => e.role === 'person').map(e => ({ at: e.at, text: e.text })),
  })
}

export function useLogView(feed: PlaygroundFeed, light: LightFeed, runtime: VoiceRuntimeHandle | null, socket: LooseSocket, labelOf: (model: string) => string): LogView {
  const { trail, version } = usePageTrail(runtime, socket)
  const { entries, decisions, calls, notes } = feed
  const { calls: checks, turns, recaps, lines } = light
  // `version` says when the trail, changed in place, changed.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => buildLogView({ entries, decisions, calls, notes }, { calls: checks, turns, recaps, lines }, trail, labelOf), [entries, decisions, calls, notes, checks, turns, recaps, lines, trail, version, labelOf])
}
