import { Navigate, useParams } from 'react-router'
import { useQuery, getSession } from 'wasp/client/operations'
import { AppLayout } from '../../shared/layouts/AppLayout'
import { PanelChatView } from '../../shared/components/ChatPanel/PanelChatView'

type SessionRow = {
  taskId: string | null
  agent: { name: string } | null
  primaryLocation: { ownerName: string; href: string | null } | null
}

/**
 * A run's session by its id: only a task's session shows here. Any other — a conversation's worker —
 * goes to Chat.
 */
export function ChatSessionPage() {
  const { id } = useParams<{ id: string }>()
  const { data } = useQuery(getSession, { id: id! }, { enabled: !!id })
  const session = data as SessionRow | undefined

  if (session && !session.taskId) return <Navigate to="/chat" replace />

  const agentName = session?.agent?.name ?? 'Chat'
  const ctx = session?.primaryLocation

  return (
    <AppLayout
      breadcrumbs={[
        { label: 'Chat', href: '/chat' },
        ...(ctx?.href ? [{ label: ctx.ownerName, href: ctx.href }] : []),
        { label: agentName },
      ]}
    >
      <div className="h-full overflow-hidden">
        {id && session && (
          <PanelChatView sessionId={id} mode="full" />
        )}
      </div>
    </AppLayout>
  )
}
