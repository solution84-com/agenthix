import { useState } from 'react'
import { Button } from '@agenthix/ui/primitives'
import { DISMISS_ALL_CONFIRM_ABOVE, dismissNotices } from './notices'

/** Dismisses the notices shown; with more than a few it asks first, in words. Draws nothing when there are none. */
export function DismissAll({ ids }: { ids: string[] }) {
  const [asking, setAsking] = useState(false)
  const [working, setWorking] = useState(false)
  const [refusal, setRefusal] = useState<string | null>(null)
  if (ids.length === 0) return null

  const run = () => {
    setAsking(false)
    setRefusal(null)
    setWorking(true)
    dismissNotices(ids)
      .catch((err: unknown) => setRefusal(err instanceof Error ? err.message : String(err)))
      .finally(() => setWorking(false))
  }
  const start = () => (ids.length > DISMISS_ALL_CONFIRM_ABOVE ? setAsking(true) : run())

  return (
    <div className="text-small">
      {asking ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-text-primary">Dismiss all {ids.length} notices? They leave this list for good.</span>
          <Button variant="secondary" size="sm" onClick={run}>{`Yes, dismiss ${ids.length}`}</Button>
          <Button variant="secondary" size="sm" onClick={() => setAsking(false)}>Keep them</Button>
        </div>
      ) : (
        <Button variant="secondary" size="sm" disabled={working} onClick={start}>{working ? 'Dismissing…' : 'Dismiss all'}</Button>
      )}
      {refusal && <p className="mt-1 text-danger">{refusal}</p>}
    </div>
  )
}
