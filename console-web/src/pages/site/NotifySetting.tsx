import { useEffect, useState } from 'react'
import { api } from '../../api/client'
import { Notice, NOTIFY_HINT, NOTIFY_HQ_HINT, NotifyChoice } from '../../components'
import type { FleetHost } from '../dashboard/types'
import { notifies } from '../dashboard/words'

/**
 * The machine's *Notify the fleet admins if this machine stops answering*, changed on its page
 * (`PUT /api/hosts/:fp/notify`). HQ's machine shows it ticked and disabled, with why.
 */
export function NotifySetting({ host, onChanged }: { host: FleetHost; onChanged?: () => void }) {
  const [checked, setChecked] = useState(notifies(host))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => { if (!busy) setChecked(notifies(host)) }, [host, busy])

  if (host.hqMachine) return <div className="mb-4"><NotifyChoice checked disabled hint={NOTIFY_HQ_HINT} /></div>

  const change = (notify: boolean) => {
    setChecked(notify)
    setBusy(true)
    setError(null)
    api<{ host: FleetHost }>(`/hosts/${host.fingerprint}/notify`, { method: 'PUT', body: { notify } })
      .then(() => onChanged?.())
      .catch((err: unknown) => {
        setChecked(!notify)
        setError(err instanceof Error ? err.message : String(err))
      })
      .finally(() => setBusy(false))
  }
  return (
    <div className="mb-4">
      <NotifyChoice checked={checked} disabled={busy} onChange={change} hint={NOTIFY_HINT} />
      {error && <Notice title="The setting was not changed">{error}</Notice>}
    </div>
  )
}
