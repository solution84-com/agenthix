import { useEffect, useRef, useState } from 'react'

export type SaveState = 'idle' | 'saving' | 'saved'

/** One part of Settings saving on its own: a short "Saved", or the problem beside the part. */
export function usePartSave() {
  const [state, setState] = useState<SaveState>('idle')
  const [problem, setProblem] = useState('')
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])

  async function save(work: () => Promise<unknown>, failure = 'Could not save'): Promise<boolean> {
    clearTimeout(timer.current)
    setProblem('')
    setState('saving')
    try {
      await work()
      setState('saved')
      timer.current = setTimeout(() => setState('idle'), 2000)
      return true
    } catch (err) {
      setState('idle')
      setProblem(err instanceof Error ? err.message : failure)
      return false
    }
  }
  const fail = (message: string) => { clearTimeout(timer.current); setState('idle'); setProblem(message) }
  const clear = () => setProblem('')
  return { state, problem, save, fail, clear }
}

export type PartSave = ReturnType<typeof usePartSave>

export function SaveMark({ save }: { save: PartSave }) {
  if (save.problem) return <span role="alert" className="text-micro text-danger">{save.problem}</span>
  if (save.state === 'saving') return <span className="text-micro text-text-muted">Saving…</span>
  if (save.state === 'saved') return <span role="status" className="text-micro text-success">Saved</span>
  return null
}
