import { useEffect, useRef, useState } from 'react'
import { Button, Modal } from '@agenthix/ui/primitives'

type Failure = { message: string; retry: () => Promise<boolean> }

/**
 * One part of Settings saving on its own. A save that works shows nothing (the new value is the result); one that
 * fails opens a centred dialog with Try again. `fail` is for a value refused before it is sent: its problem shows
 * beside the part, and the part keeps what was typed.
 */
export function usePartSave() {
  const [saving, setSaving] = useState(false)
  const [problem, setProblem] = useState('')
  const [failure, setFailure] = useState<Failure | null>(null)
  const alive = useRef(true)
  useEffect(() => () => { alive.current = false }, [])

  async function save(work: () => Promise<unknown>, failureText = 'Could not save'): Promise<boolean> {
    setProblem('')
    setFailure(null)
    setSaving(true)
    try {
      await work()
      return true
    } catch (err) {
      if (alive.current) setFailure({ message: err instanceof Error ? err.message : failureText, retry: () => save(work, failureText) })
      return false
    } finally {
      if (alive.current) setSaving(false)
    }
  }
  const fail = (message: string) => setProblem(message)
  const clear = () => setProblem('')
  const dismiss = () => setFailure(null)
  return { state: saving ? 'saving' as const : 'idle' as const, problem, failure, save, fail, clear, dismiss }
}

export type PartSave = ReturnType<typeof usePartSave>

/** The problem with a value refused before it was sent, beside its part. */
export function SaveMark({ save }: { save: PartSave }) {
  return save.problem ? <span role="status" className="text-micro text-danger">{save.problem}</span> : null
}

/** What a failed save says, in a dialog of its own: which part was not changed, why, and Try again. */
export function SaveFailureDialog({ label, save }: { label: string; save: PartSave }) {
  const failure = save.failure
  return (
    <Modal open={failure !== null} onClose={save.dismiss} title={`${label} wasn't changed`} maxWidth="max-w-md">
      <p className="text-body text-text-secondary">{failure?.message}</p>
      <p className="mt-1 text-body text-text-secondary">Nothing was changed.</p>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" onClick={save.dismiss}>Close</Button>
        <Button onClick={() => void failure?.retry()}>Try again</Button>
      </div>
    </Modal>
  )
}
