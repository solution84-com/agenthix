import { useState } from 'react'

/** One action at a time on a routine, with what went wrong said in words. */
export function useRoutineAct() {
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true)
    setMessage('')
    try {
      await fn()
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'That did not work')
    } finally {
      setBusy(false)
    }
  }
  return { busy, message, act }
}
