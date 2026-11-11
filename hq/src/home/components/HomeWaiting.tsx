import { FOCUS_RING_INSET, ROW_ITEM, FOCUS_RING } from '@agenthix/ui/primitives'
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { useQuery, getNotifications, getMyRuns } from 'wasp/client/operations'
import { groupNotifications, type NotificationItem } from '../../notifications/notificationKinds'
import { AuthedAgentAvatar } from '../../shared/components/AuthedAgentAvatar'

function Card({ title, label, children }: { title: string; label: string; children: ReactNode }) {
  return (
    <section aria-label={label} className="rounded-xl border border-border bg-card px-3 py-2">
      <h2 className="pb-1 text-small font-medium text-text-primary">{title}</h2>
      {children}
    </section>
  )
}

/** What needs the person, as the Notifications panel's Needs you lists it: one line each, opening where to act on it. */
export function HomeNeedsYou() {
  const { data } = useQuery(getNotifications)
  const items = groupNotifications((data ?? []) as NotificationItem[]).needsYou
  return (
    <Card title="Needs you" label="Needs you">
      {items.length === 0 ? (
        <p className="py-2 text-small text-text-muted">{data ? 'Nothing needs you.' : 'Loading…'}</p>
      ) : (
        <ul>
          {items.map((n) => (
            <li key={n.id} className="flex items-center gap-2 border-t border-border-subtle py-2 first:border-t-0">
              <div className="min-w-0 flex-1">
                <div className="truncate text-small font-medium text-text-primary">{n.title}</div>
                {n.detail && <div className="truncate text-micro text-text-muted">{n.detail}</div>}
              </div>
              {n.actionUrl && <Link to={n.actionUrl} className={`rounded shrink-0 text-small font-medium text-link hover:underline ${FOCUS_RING}`}>{n.actionLabel ?? 'Open'}</Link>}
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

/** The person's runs going now, as the Runs panel lists them. */
export function HomeRunning() {
  const { data } = useQuery(getMyRuns)
  const running = (data ?? []).filter((r) => r.group === 'running')
  return (
    <Card title="Running now" label="Running now">
      {running.length === 0 ? (
        <p className="py-2 text-small text-text-muted">{data ? 'Nothing is running.' : 'Loading…'}</p>
      ) : (
        <ul>
          {running.map((r) => (
            <li key={r.key} className="border-t border-border-subtle first:border-t-0">
              <Link to={r.href} className={`flex items-center gap-2 py-2 ${FOCUS_RING_INSET} ${ROW_ITEM}`}>
                {r.agent && <AuthedAgentAvatar name={r.agent.name} avatarUrl={r.agent.avatarUrl} size="sm" />}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-small font-medium text-text-primary">{r.title}</span>
                  <span className="block truncate text-micro text-text-muted">{[r.agent?.name, r.place.name].filter(Boolean).join(' · ')}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
