import { useState } from 'react'
import { renewConnection, revokeConnection } from 'wasp/client/operations'
import { Button } from '@agenthix/ui/primitives'
import { CONNECTION_GROUP_INFO, DEFAULT_CONNECTION_EXPIRY_DAYS, type ConnectionView } from '../../shared/connections'
import { ShowAttention } from '@agenthix/ui/attention'

type Status = 'active' | 'expired' | 'revoked'

function statusOf(c: ConnectionView, now: number): Status {
  if (c.revokedAt) return 'revoked'
  return new Date(c.expiresAt).getTime() <= now ? 'expired' : 'active'
}

const formatDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })

export function ConnectionList({ connections }: { connections: ConnectionView[] }) {
  if (connections.length === 0) {
    return <p className="text-body text-text-muted">You have no connections yet.</p>
  }
  const now = Date.now()
  return (
    <ul className="space-y-3">
      {connections.map(c => <ConnectionRow key={c.id} connection={c} status={statusOf(c, now)} />)}
    </ul>
  )
}

function ConnectionRow({ connection: c, status }: { connection: ConnectionView; status: Status }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function act(fn: () => Promise<unknown>) {
    setBusy(true)
    setError(null)
    try {
      await fn()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setBusy(false)
    }
  }

  const revoke = () => {
    if (!confirm(`Revoke "${c.name}"? Anything using it stops working at once.`)) return
    void act(() => revokeConnection({ id: c.id }))
  }
  const renew = () => void act(() => renewConnection({ id: c.id }))

  return (
    <li className={`bg-surface-1 border border-border rounded-xl p-4 space-y-2 ${status === 'revoked' ? 'opacity-40' : ''}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-body font-medium text-text-primary truncate">{c.name}</p>
          <p className="text-small font-mono text-text-muted">{c.tokenPrefix}…</p>
        </div>
        {status !== 'revoked' && (
          <div className="flex gap-2 shrink-0">
            <Button variant="secondary" size="sm" disabled={busy} onClick={renew}>
              Renew for {DEFAULT_CONNECTION_EXPIRY_DAYS} days
            </Button>
            <Button variant="danger" size="sm" disabled={busy} onClick={revoke}>Revoke</Button>
          </div>
        )}
      </div>

      <dl className="grid grid-cols-[110px_1fr] gap-x-3 gap-y-1 text-small">
        <dt className="text-text-muted">Permissions</dt>
        <dd className="text-text-secondary">{c.groups.map(g => CONNECTION_GROUP_INFO[g].label).join(', ')}</dd>
        <dt className="text-text-muted">Projects</dt>
        <dd className="text-text-secondary">{c.projects === null ? 'All my projects' : c.projects.map(p => p.name).join(', ')}</dd>
        <dt className="text-text-muted">Last used</dt>
        <dd className="text-text-secondary">{c.lastUsedAt ? formatDate(c.lastUsedAt) : 'Never'}</dd>
        <dt className="text-text-muted">{status === 'revoked' ? 'Revoked' : status === 'expired' ? 'Expired' : 'Expires'}</dt>
        <dd className={status === 'active' ? 'text-text-secondary' : 'text-warning'}>
          {formatDate(status === 'revoked' && c.revokedAt ? c.revokedAt : c.expiresAt)}
        </dd>
      </dl>

      <ShowAttention kind="alert" text={error} title="The connection was not revoked" onClose={() => setError(null)} />
    </li>
  )
}
