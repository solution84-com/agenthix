import { useState } from 'react'
import { Input } from '@agenthix/ui/primitives'
import { ConfirmModal, Notice } from '../../components'
import { api } from '../../api/client'
import { navigate } from '../../router'
import { changeWords, pendingChanges } from '../dashboard/overview'
import type { FleetHost } from '../dashboard/types'
import { runsSite, whenIs } from '../dashboard/words'

/**
 * *Disconnect…* on a site's page (board *Disconnecting a machine*, spec §6): asks first, saying what stays, and needs
 * the machine's name typed. HQ forgets the site's credential and the machine's (spec §10: a site stops taking part when
 * it is disconnected in the Fleet Console); nothing on the machine is removed.
 */
export function DisconnectModal({ host, open, onClose }: { host: FleetHost; open: boolean; onClose: () => void }) {
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const now = new Date()
  const left = host.leftByItself
  const name = host.machineName
  const changes = pendingChanges(host)
  const one = changes.length === 1

  const close = () => { setTyped(''); setError(null); onClose() }
  const disconnect = () => {
    setBusy(true)
    setError(null)
    api<{ disconnected: boolean }>(`/hosts/${host.fingerprint}/disconnect`, { method: 'POST', body: {} })
      .then(() => navigate('/'))
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setBusy(false))
  }

  return (
    <ConfirmModal
      open={open}
      title={left ? `Remove ${name} from the list?` : `Disconnect ${name}?`}
      confirmLabel={left ? 'Remove from the list' : `Disconnect ${name}`}
      destructive
      busy={busy || typed.trim() !== name}
      onConfirm={disconnect}
      onCancel={close}
    >
      {left ? (
        <p>It disconnected itself {host.leftAt ? whenIs(host.leftAt, now) : 'earlier'}, on the machine. Removing it here has HQ forget it and its site too. Nothing on the machine is removed.</p>
      ) : (
        <>
          <p>The Fleet Console stops managing it. Nothing on the machine is removed:</p>
          <ul className="my-2 list-disc space-y-1 pl-5 text-small">
            <li>{host.siteRegistered
              ? <>Its Execution Site, {host.siteName}, stops taking part in HQ: HQ forgets its credential. Its workspaces stay on the machine.</>
              : runsSite(host) ? <>HQ does not know its site yet, so nothing changes in HQ.</> : <>It runs no site, so nothing changes in HQ.</>}
            </li>
            {runsSite(host) && <li>It keeps backing up each night, and keeps its backup location. The Fleet Console no longer shows them.</li>}
            {changes.length > 0 && (
              <li>
                Its planned maintenance — {changes.map(c => `${changeWords(c).toLowerCase()} ${whenIs(c.at, now)}`).join('; ')} — stays with
                the machine and still runs. Cancel {one ? 'it' : 'them'} first in Maintenance if you do not want {one ? 'it' : 'them'}.
              </li>
            )}
          </ul>
        </>
      )}
      <p className="text-small">To manage it again, add it with a new code.</p>
      <label htmlFor="disconnect-name" className="mt-3 block text-small font-medium text-text-secondary">Type the machine's name to confirm</label>
      <Input id="disconnect-name" value={typed} placeholder={name} autoComplete="off" onChange={e => setTyped(e.target.value)} />
      <p className="mt-2 text-small text-text-muted">Every fleet admin sees this under Activity.</p>
      {error && <div className="mt-2"><Notice tone="danger">{error}</Notice></div>}
    </ConfirmModal>
  )
}
