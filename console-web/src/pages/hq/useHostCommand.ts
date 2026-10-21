import { useCallback, useEffect, useRef, useState } from 'react'
import type { HostRequest, HostResult } from '@agenthix/core'
import { api } from '../../api/client'
import type { CommandRun } from './hqWords'

type CommandAnswer = { command: { id: string; state: 'pending' | 'done' | 'failed'; result: HostResult | null; problem: string | null } }

const outcome = (answer: CommandAnswer['command']): CommandRun => {
  if (answer.state === 'failed') return { phase: 'refused', message: answer.problem ?? 'The command failed.' }
  const r = answer.result
  if (r?.ok) return { phase: 'done', result: r.result }
  return { phase: 'refused', message: r && !r.ok ? r.refusal.message : 'The machine gave no answer.' }
}

/** One operation of the closed set, sent through the command route and followed until it ends. */
export function useHostCommand(fingerprint: string, pollMs = 1500): { run: CommandRun; send: (request: HostRequest) => void; reset: () => void } {
  const [run, setRun] = useState<CommandRun>({ phase: 'idle' })
  const alive = useRef(true)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])

  const send = useCallback((request: HostRequest) => {
    setRun({ phase: 'working' })
    const follow = async () => {
      try {
        let { command } = await api<CommandAnswer>(`/hosts/${fingerprint}/commands`, { method: 'POST', body: { request } })
        while (command.state === 'pending') {
          await new Promise(resolve => setTimeout(resolve, pollMs))
          if (!alive.current) return
          command = (await api<CommandAnswer>(`/commands/${command.id}`)).command
        }
        if (alive.current) setRun(outcome(command))
      } catch (err) {
        if (alive.current) setRun({ phase: 'refused', message: err instanceof Error ? err.message : String(err) })
      }
    }
    void follow()
  }, [fingerprint, pollMs])

  const reset = useCallback(() => setRun({ phase: 'idle' }), [])
  return { run, send, reset }
}
