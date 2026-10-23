import { useState } from 'react'

/** Runs a save, keeping its error to show beside the field instead of losing it. */
export function useSaving() {
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const run = async (work: () => Promise<unknown>) => {
    setSaving(true)
    setError('')
    try { await work() } catch (err) { setError(err instanceof Error ? err.message : 'Could not save') } finally { setSaving(false) }
  }
  return { error, saving, run }
}
