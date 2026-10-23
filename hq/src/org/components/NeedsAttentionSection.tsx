import { useState } from 'react'
import { Link } from 'react-router'
import { useQuery, useAction, getNeedsAttention, getMyModelAccess, acknowledgeBypassedAgents, dismissNotification } from 'wasp/client/operations'
import { OrgGroupHeading } from './orgCardParts'

/** No working model is read from what is stored each time, not kept as a notification: it clears the moment it is set. */
const MODEL_ACCESS_ITEM = {
  key: 'model-access', area: 'infrastructure', type: 'model_access', title: "Agents can't answer yet",
  body: 'No model provider is working: add one, or fix the one there is',
  actionLabel: 'Open Providers', actionUrl: '/admin/providers', notificationIds: [] as string[],
  dismissible: false, acknowledgeable: false,
}

const ACTION = 'shrink-0 rounded-lg border border-border bg-surface-1 px-2.5 py-1 text-small font-medium text-text-secondary hover:bg-surface-hover hover:text-text-primary disabled:opacity-40'

/**
 * Needs attention (every screen reviewed spec §3, Organisation), for admins: one list across the workplace and the
 * infrastructure, each item with its one action. Items are the admin's own notifications, so handling one here or in
 * Notifications clears both. Bypassed is a fact, not an alarm: Review opens the agents, and an admin may Acknowledge it.
 */
export function NeedsAttentionSection() {
  const { data: notices, refetch } = useQuery(getNeedsAttention, undefined, { refetchInterval: 30_000 })
  const { data: access } = useQuery(getMyModelAccess)
  const items = notices && (access && !access.canTalk && access.fix === 'org-access' ? [MODEL_ACCESS_ITEM, ...notices] : notices)
  const acknowledge = useAction(acknowledgeBypassedAgents)
  const dismiss = useAction(dismissNotification)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')

  const run = async (key: string, work: () => Promise<unknown>) => {
    setBusy(key)
    setError('')
    try { await work(); await refetch() } catch (err) { setError(err instanceof Error ? err.message : 'That did not work') } finally { setBusy(null) }
  }

  return (
    <section aria-label="Needs attention">
      <OrgGroupHeading
        title={`Needs attention${items && items.length > 0 ? ` · ${items.length}` : ''}`}
        aside="Clears itself when handled"
      />
      <div className="rounded-2xl border border-border-subtle bg-surface-1 px-4 py-1.5">
        {!items ? (
          <p className="py-3 text-small text-text-muted">Loading…</p>
        ) : items.length === 0 ? (
          <p className="py-3 text-body text-text-secondary">Nothing needs you.</p>
        ) : (
          <ul className="divide-y divide-border-subtle">
            {items.map(item => (
              <li key={item.key} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
                <div className="min-w-0 flex-1 basis-64">
                  <div className={`text-body font-medium ${item.area === 'infrastructure' ? 'text-warning' : 'text-text-primary'}`}>{item.title}</div>
                  {item.body && <div className="text-small text-text-muted">{item.body}</div>}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {item.actionUrl && item.actionLabel && (
                    <Link to={item.actionUrl} className={ACTION}>{item.actionLabel}</Link>
                  )}
                  {item.acknowledgeable && (
                    <button type="button" disabled={busy === item.key} className={ACTION} onClick={() => void run(item.key, () => acknowledge(undefined))}>Acknowledge</button>
                  )}
                  {item.dismissible && item.notificationIds.length === 1 && (
                    <button type="button" disabled={busy === item.key} className={ACTION} onClick={() => void run(item.key, () => dismiss({ id: item.notificationIds[0] }))}>Dismiss</button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      {error && <p role="alert" className="mt-2 text-small text-danger">{error}</p>}
    </section>
  )
}
