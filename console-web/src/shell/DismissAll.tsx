import { useState } from 'react'
import { Button, ConfirmDialog } from '@agenthix/ui/primitives'
import { Notice } from '../components'
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
      <Button variant="secondary" size="sm" disabled={working} onClick={start}>{working ? 'Dismissing…' : 'Dismiss all'}</Button>
      <ConfirmDialog open={asking} title={`Dismiss all ${ids.length} notices?`} confirmLabel={`Yes, dismiss ${ids.length}`} onConfirm={run} onCancel={() => setAsking(false)}>
        They leave this list for good.
      </ConfirmDialog>
      {refusal && <Notice kind="alert" title="Not dismissed">{refusal}</Notice>}
    </div>
  )
}
