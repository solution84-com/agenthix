import type { ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { KeyRound, Settings2 } from 'lucide-react'
import { PanelItem, PanelItemAction } from '@agenthix/ui/primitives'
import { PERSISTENT_TYPES, type NotificationItem } from '../../../notifications/notificationKinds'
import { AgentAvatar } from '../SessionComponents'
import { useAgentImageUrl } from '../../hooks/useAgentImageUrl'
import { useApproveNow } from './useApproveNow'
import { whenText } from '../RunsPanel/panelTime'

/** The one action of a notification that waits on the person, by its kind. */
const ACTION_LABEL: Record<string, string> = { credential_health: 'Renew', task_waiting: 'Open' }

function SystemSign({ type }: { type: string }) {
  const Icon = type === 'credential_health' ? KeyRound : Settings2
  return (
    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-surface-2 text-warning">
      <Icon size={13} />
    </span>
  )
}

/**
 * One notification in two lines (spec §6): what it is, with its task's key;
 * then why. At the right, when, and its one button: Approve on a tool request,
 * which approves it there and then; the others go to their page. A tap on the
 * item opens a tool request in the panel. Dismissed with ✕ on hover, in Earlier — and under Needs you for a persistent notification that may be dismissed.
 */
export function NotificationRow({ n, needsYou, onOpenRequest, onDismiss }: {
  n: NotificationItem
  needsYou: boolean
  onOpenRequest: (taskKey: string) => void
  onDismiss: (id: string) => void
}) {
  const { approve, approving } = useApproveNow()
  const navigate = useNavigate()
  const avatarUrl = useAgentImageUrl(n.task?.agent?.avatarUrl)
  const go = n.actionUrl ? () => navigate(n.actionUrl!) : undefined

  let action: ReactNode = null
  if (needsYou && n.type === 'tool_approval' && n.task) {
    const key = n.task.key
    action = (
      <PanelItemAction look="primary" disabled={approving === key} onClick={async () => { if (!(await approve(key))) onOpenRequest(key) }}>
        Approve
      </PanelItemAction>
    )
  } else if (go) {
    action = <PanelItemAction onClick={go}>{needsYou ? ACTION_LABEL[n.type] ?? 'Open' : 'Open'}</PanelItemAction>
  }

  // A persistent notification asks to be dismissed only when its kind allows it; the rest clear themselves once fixed.
  const canDismiss = n.dismissible !== false && (!needsYou || (PERSISTENT_TYPES.includes(n.type) && n.dismissible))

  const detail = n.command
    ? <>Wants to run <code className="font-mono text-text-primary">{n.command}</code>{n.detail && ` ${n.detail}`}</>
    : n.detail

  return (
    <PanelItem
      itemId={n.id}
      icon={n.task?.agent
        ? <AgentAvatar name={n.task.agent.name} avatarUrl={avatarUrl} size="sm" />
        : n.task ? undefined : <SystemSign type={n.type} />}
      itemKey={n.task?.key}
      title={n.task?.title ?? n.title}
      detail={detail}
      time={whenText(n.createdAt)}
      action={action}
      unread={n.status === 'unread'}
      quiet={!needsYou}
      onOpen={needsYou && n.type === 'tool_approval' && n.task ? () => onOpenRequest(n.task!.key) : go}
      onDismiss={canDismiss ? () => onDismiss(n.id) : undefined}
    />
  )
}
