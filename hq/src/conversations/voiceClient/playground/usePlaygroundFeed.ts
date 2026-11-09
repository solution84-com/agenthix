/**
 * What the playground's server side tells the page beyond hq's own events: entries, decisions, and the Log's own
 * entries (each model call as a CALL, the server's lines as a NOTICE or an ERROR), with whatever the page adds.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { LooseSocket } from '../voiceSession'
import {
  VOICE_PLAYGROUND_SOCKET as P,
  type PlaygroundDecision, type PlaygroundEntry, type PlaygroundLog, type PlaygroundUsage,
} from '../../../shared/voicePlayground'
import type { LogBadge, LogEntry } from './playgroundLog'

export function upsert(entries: readonly PlaygroundEntry[], e: PlaygroundEntry): PlaygroundEntry[] {
  const i = entries.findIndex(x => x.id === e.id)
  if (i < 0) return [...entries, e]
  const next = [...entries]
  next[i] = e
  return next
}

const MAX_NOTES = 300

export const callWords = (model: string, u: Pick<PlaygroundUsage, 'inputTokens' | 'outputTokens'>) =>
  `${model} · ${u.inputTokens.toLocaleString()} in · ${u.outputTokens.toLocaleString()} out`

export function usePlaygroundFeed(socket: LooseSocket | null, labelOf: (model: string) => string = m => m) {
  const [entries, setEntries] = useState<PlaygroundEntry[]>([])
  const [decisions, setDecisions] = useState<PlaygroundDecision[]>([])
  const [notes, setNotes] = useState<LogEntry[]>([])
  const [calls, setCalls] = useState<PlaygroundUsage[]>([])
  const label = useRef(labelOf)
  label.current = labelOf
  const counter = useRef(0)
  const add = useCallback((entry: Omit<LogEntry, 'id' | 'at'> & { at?: number }) => {
    const made: LogEntry = { at: Date.now(), ...entry, id: `note-${counter.current++}` }
    setNotes(list => [...list.slice(-MAX_NOTES + 1), made])
  }, [])
  const note = useCallback((badge: LogBadge, title: string, after?: string) => add({ badge, title, ...(after && { after }) }), [add])
  const log = useCallback((line: string) => note('ERROR', line), [note])
  const clearNotes = useCallback((badge?: LogBadge) => setNotes(list => (badge ? list.filter(n => n.badge !== badge) : [])), [])

  useEffect(() => {
    if (!socket) return
    const handlers: Array<[string, (e: never) => void]> = [
      [P.entry, (e: PlaygroundEntry) => setEntries(list => upsert(list, e))],
      [P.cleared, () => { setEntries([]); setDecisions([]); setCalls([]) }],
      [P.decision, (d: PlaygroundDecision) => setDecisions(list => [...list, d])],
      // A call that answered a turn is folded into that turn's line in the Log; any other stands alone.
      [P.usage, (u: PlaygroundUsage) => (u.turnId ? setCalls(list => [...list, u]) : note('CALL', callWords(label.current(u.model), u)))],
      [P.log, (e: PlaygroundLog) => note(e.level === 'error' ? 'ERROR' : 'NOTICE', e.text)],
    ]
    for (const [event, handler] of handlers) socket.on(event, handler)
    return () => { for (const [event, handler] of handlers) socket.off(event, handler) }
  }, [socket, note])
  return { entries, decisions, calls, notes, note, add, log, clearNotes }
}

export type PlaygroundFeed = ReturnType<typeof usePlaygroundFeed>
