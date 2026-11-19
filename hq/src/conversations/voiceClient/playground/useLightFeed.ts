/**
 * The light model's side of the playground's socket (plan tasks 5.1 and 5.3): the page's light model settings sent
 * whenever they change, so the next call runs on them; and each call, turn outcome, recap and line the server tells,
 * kept for the Log until the conversation is cleared.
 */
import { useEffect, useState, useSyncExternalStore } from 'react'
import type { ModelChoices } from '../../../shared/conversations/protocol'
import { VOICE_PLAYGROUND_SOCKET as P } from '../../../shared/voicePlayground'
import {
  LIGHT_SOCKET as L, type LightCallRow, type LightLineRow, type LightRecapRow, type LightTurnRow, type PlaygroundLightConfig,
} from '../../../shared/voicePlaygroundLight'
import type { LooseSocket } from '../voiceSession'
import { effectiveListenerModel } from './lightModel'
import type { PlaygroundSettings, PlaygroundSettingsValue } from './settings'

const KEPT = 300

export function lightConfigOf(v: PlaygroundSettingsValue, choices: ModelChoices | undefined): PlaygroundLightConfig {
  return {
    // Adaptive voice is the light model: the flag is on, and the person's Adaptive voice says whether it listens.
    on: true, model: effectiveListenerModel(v.listenerModel, choices), settings: v.listener, lead: v.lead, adaptiveVoice: v.adaptiveVoice,
    lineDirection: v.lineDirection,
    humModel: effectiveListenerModel(v.humModel, choices), humSteering: v.humSteering,
  }
}

export function useLightFeed(socket: LooseSocket, settings: PlaygroundSettings, choices: ModelChoices | undefined) {
  const value = useSyncExternalStore(settings.subscribe, settings.get)
  const [calls, setCalls] = useState<LightCallRow[]>([])
  const [turns, setTurns] = useState<LightTurnRow[]>([])
  const [recaps, setRecaps] = useState<LightRecapRow[]>([])
  const [lines, setLines] = useState<LightLineRow[]>([])

  const config = JSON.stringify(lightConfigOf(value, choices))
  useEffect(() => { socket.emit(L.config, JSON.parse(config)) }, [socket, config])

  useEffect(() => {
    const keep = <T>(set: (f: (list: T[]) => T[]) => void) => (row: T) => set(list => [...list.slice(-KEPT + 1), row])
    const handlers: Array<[string, (e: never) => void]> = [
      [L.call, keep(setCalls)],
      [L.turn, keep(setTurns)],
      [L.recap, keep(setRecaps)],
      [L.line, keep(setLines)],
      [P.cleared, () => { setCalls([]); setTurns([]); setRecaps([]); setLines([]) }],
    ]
    for (const [event, handler] of handlers) socket.on(event, handler)
    return () => { for (const [event, handler] of handlers) socket.off(event, handler) }
  }, [socket])

  return { calls, turns, recaps, lines }
}

export type LightFeed = ReturnType<typeof useLightFeed>
