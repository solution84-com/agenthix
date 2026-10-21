import { useMemo, useRef } from 'react'
import {
  useQuery, useAction,
  getNotifications, dismissNotification, markNotificationsRead,
} from 'wasp/client/operations'
import { PanelGroupHeading } from '@agenthix/ui/primitives'
import { groupNotifications, type NotificationItem } from '../../../notifications/notificationKinds'
import { PanelHead } from './PanelHead'
import { NotificationRow } from './NotificationRow'
import { useMarkSeen } from './useMarkSeen'

/**
 * The Notifications panel (spec §6): Needs you — what waits on the person —
 * then Earlier. An item is marked seen once it has been in view here; one that
 * needs the person stays under Needs you until it is handled, which happens by
 * itself when its run moves on or anyone answers it.
 */
export function NotificationPanel({ onOpenRequest }: { onOpenRequest: (taskKey: string) => void }) {
  const { data } = useQuery(getNotifications)
  const dismissFn = useAction(dismissNotification)
  const markSeen = useAction(markNotificationsRead)
  const list = useRef<HTMLDivElement>(null)

  const notifications = (data ?? []) as NotificationItem[]
  const groups = useMemo(() => groupNotifications(notifications), [notifications])
  const unreadIds = useMemo(() => notifications.filter(n => n.status === 'unread').map(n => n.id), [notifications])
  useMarkSeen(list, unreadIds, ids => markSeen({ ids }))

  const row = (n: NotificationItem, needsYou: boolean) => (
    <NotificationRow key={n.id} n={n} needsYou={needsYou} onOpenRequest={onOpenRequest} onDismiss={id => dismissFn({ id })} />
  )

  return (
    <div className="flex flex-col h-full">
      <PanelHead title="Notifications" />
      <div ref={list} className="flex-1 overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
        {notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-16 text-center text-small text-text-muted">
            You're all caught up
          </div>
        ) : (
          <>
            {groups.needsYou.length > 0 && (
              <section aria-label="Needs you">
                <PanelGroupHeading label="Needs you" count={groups.needsYou.length} tone="warning" />
                <ul>{groups.needsYou.map(n => row(n, true))}</ul>
              </section>
            )}
            {groups.earlier.length > 0 && (
              <section aria-label="Earlier">
                <PanelGroupHeading label="Earlier" />
                <ul>{groups.earlier.map(n => row(n, false))}</ul>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  )
}
