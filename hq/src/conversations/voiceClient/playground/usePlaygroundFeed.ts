/**
 * What the playground's server side tells the page beyond hq's own events: entries, decisions, each reply's model call,
 * and the Log's own notes (a model call that answers no turn and the server's lines, as SYSTEM notices or errors), with
 * whatever the page adds.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { LooseSocket } from '../voiceSession'
import {
  VOICE_PLAYGROUND_SOCKET as P,
  type PlaygroundDecision, type PlaygroundEntry, type PlaygroundLog, type PlaygroundUsage,
} from '../../../shared/voicePlayground'
import type { LogNote } from './logModel'
import { callWords } from './otherSteps'

export function upsert(entries: readonly PlaygroundEntry[], e: PlaygroundEntry): PlaygroundEntry[] {
  const i = entries.findIndex(x => x.id === e.id)
  if (i < 0) return [...entries, e]
  const next = [...entries]
  next[i] = e
  return next
}

const MAX_NOTES = 300

export function usePlaygroundFeed(socket: LooseSocket | null, labelOf: (model: string) => string = m => m) {
  const [entries, setEntries] = useState<PlaygroundEntry[]>([])
  const [decisions, setDecisions] = useState<PlaygroundDecision[]>([])
  const [notes, setNotes] = useState<LogNote[]>([])
  const [calls, setCalls] = useState<PlaygroundUsage[]>([])
  const label = useRef(labelOf)
  label.current = labelOf
  const counter = useRef(0)
  const note = useCallback((kind: LogNote['kind'], title: string, detail?: string) => {
    const made: LogNote = { id: `note-${counter.current++}`, at: Date.now(), kind, title, ...(detail && { detail }) }
    setNotes(list => [...list.slice(-MAX_NOTES + 1), made])
  }, [])
  const log = useCallback((line: string) => note('error', line), [note])

  useEffect(() => {
    if (!socket) return
    const handlers: Array<[string, (e: never) => void]> = [
      [P.entry, (e: PlaygroundEntry) => setEntries(list => upsert(list, e))],
      [P.cleared, () => { setEntries([]); setDecisions([]); setCalls([]); setNotes([]) }],
      [P.decision, (d: PlaygroundDecision) => setDecisions(list => [...list, d])],
      // A call that answered a turn is folded into that turn's line in the Log; any other stands alone.
      [P.usage, (u: PlaygroundUsage) => (u.turnId ? setCalls(list => [...list, u]) : note('notice', 'A model call that answers no turn', callWords(label.current(u.model), u)))],
      [P.log, (e: PlaygroundLog) => note(e.level === 'error' ? 'error' : 'notice', e.text)],
    ]
    for (const [event, handler] of handlers) socket.on(event, handler)
    return () => { for (const [event, handler] of handlers) socket.off(event, handler) }
  }, [socket, note])
  return { entries, decisions, calls, notes, note, log }
}

export type PlaygroundFeed = ReturnType<typeof usePlaygroundFeed>
