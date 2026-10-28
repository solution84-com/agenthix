import { useCallback, useState } from 'react'

/** The message of a refused or failed operation: Wasp's error carries the server's words, which end "Nothing was changed." */
export function messageOf(err: unknown): string {
  const m = err && typeof err === 'object' && 'message' in err ? String((err as { message: unknown }).message) : ''
  return m || "That didn't work. Nothing was changed."
}

/** Runs one operation at a time and keeps what it said when it failed. */
export function useAct() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const run = useCallback(async <T,>(work: () => Promise<T>): Promise<T | undefined> => {
    setBusy(true)
    setError(null)
    try {
      return await work()
    } catch (err) {
      setError(messageOf(err))
      return undefined
    } finally {
      setBusy(false)
    }
  }, [])
  return { busy, error, run, clear: () => setError(null) }
}
