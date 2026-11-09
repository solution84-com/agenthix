/**
 * The Scenarios mode's state, through the playground's socket: the fixed library (asked for once), the last run's
 * results as they arrive, kept in memory only, and what one call sent, asked for when a line's dialog wants it.
 */
import { useCallback, useEffect, useState } from 'react'
import {
  VOICE_PLAYGROUND_SOCKET as P,
  type ScenarioLibrary, type ScenarioLibraryAck, type ScenarioResult, type ScenarioRunAck, type ScenarioRunDone,
  type ScenarioSentAck, type SentRequest,
} from '../../../shared/voicePlayground'
import type { AckSocket } from './playgroundSession'
import { NO_RUN, resultKey, type RunState } from './scenarioRun'

const ACK_TIMEOUT_MS = 10_000

export function useScenarioRun(socket: AckSocket) {
  const [library, setLibrary] = useState<ScenarioLibrary | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const [run, setRun] = useState<RunState>(NO_RUN)

  useEffect(() => {
    let live = true
    socket.timeout(ACK_TIMEOUT_MS).emitWithAck(P.scenarios, {})
      .then(a => {
        if (!live) return
        const ack = a as ScenarioLibraryAck
        if (ack.ok) setLibrary(ack.library)
        else setProblem(ack.error)
      })
      .catch(() => { if (live) setProblem('The scenarios could not be loaded.') })
    return () => { live = false }
  }, [socket])

  useEffect(() => {
    const onResult = (r: ScenarioResult) => setRun(s => (s.runId === r.runId
      ? { ...s, results: { ...s.results, [resultKey(r.scenarioId, r.model)]: { ...r, at: Date.now() } } }
      : s))
    const onDone = (d: ScenarioRunDone) => setRun(s => (s.runId === d.runId ? { ...s, running: false, endedAt: Date.now() } : s))
    socket.on(P.scenarioResult, onResult as never)
    socket.on(P.scenarioDone, onDone as never)
    return () => { socket.off(P.scenarioResult, onResult as never); socket.off(P.scenarioDone, onDone as never) }
  }, [socket])

  const start = useCallback(async (models: string[], adaptiveVoice: boolean) => {
    setProblem(null)
    try {
      const ack = await socket.timeout(ACK_TIMEOUT_MS).emitWithAck(P.scenarioRun, { models, adaptiveVoice }) as ScenarioRunAck
      if (!ack.ok) { setProblem(ack.error); return }
      setRun({ runId: ack.runId, models, results: {}, running: true, startedAt: Date.now(), endedAt: null })
    } catch {
      setProblem('The run could not be started.')
    }
  }, [socket])

  const clear = useCallback(() => {
    socket.emit(P.scenarioClear, {})
    setRun(NO_RUN)
    setProblem(null)
  }, [socket])

  const sent = useCallback(async (scenarioId: string, model: string): Promise<SentRequest> => {
    const ack = await socket.timeout(ACK_TIMEOUT_MS).emitWithAck(P.scenarioSent, { runId: run.runId, scenarioId, model }) as ScenarioSentAck
    if (!ack.ok) throw new Error(ack.error)
    return ack.sent
  }, [socket, run.runId])

  return { library, problem, run, start, clear, sent }
}

export type ScenarioRunFeed = ReturnType<typeof useScenarioRun>
