import { useState } from 'react'
import { pressFailureWords } from '../../shared/failureWords'

/** Runs a save, keeping its error to show beside the field instead of losing it. */
export function useSaving() {
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const run = async (work: () => Promise<unknown>) => {
    setSaving(true)
    setError('')
    try { await work() } catch (err) { setError(pressFailureWords(err, 'Could not save')) } finally { setSaving(false) }
  }
  return { error, saving, run }
}
