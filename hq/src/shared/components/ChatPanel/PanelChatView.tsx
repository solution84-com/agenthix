import { useEffect, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { useQuery, useAction } from 'wasp/client/operations'
import {
  getSession, getProject, triggerAgentRun, cancelAgentRun, updateSession,
  getSessionPendingManifest,
  approveManifest, rejectManifest, tryAgain, sendWaitingMessageNow, cancelWaitingMessage, summariseConversation,
} from 'wasp/client/operations'
import { useSocket } from 'wasp/client/webSocket'
import { PanelChatView as LiftedPanelChatView, ClosedConversationNotice } from '@agenthix/ui/sessions'
import { MarkdownMessage } from '../MarkdownMessage'
import { resolveAgentImageUrl } from '../../utils/agentImageUrl'
import { useMayWork, VIEWER_CANNOT_WORK } from '../../hooks/useMayWork'
import { closedConversationCopy, type ClosedState } from '../../closedConversation'
import { setConversationPopup, useConversationPopup } from '../../../sessions/conversationPopup'
import { useConversationLinks } from './useConversationLinks'
import { newConversationPath } from '../../../conversations/threadPaths'

/**
 * LiftedPanelChatView renders the header and every transcript avatar straight
 * from what this query returns (it has zero Wasp dependencies, so it cannot
 * fetch one itself) — so the raw stored path is resolved into an
 * authenticated object URL here, before the data ever reaches it.
 */
async function withResolvedSessionAvatar(session: unknown): Promise<unknown> {
  const s = session as { agent: { avatarUrl: string | null } | null }
  if (!s?.agent) return s
  return { ...s, agent: { ...s.agent, avatarUrl: await resolveAgentImageUrl(s.agent.avatarUrl) } }
}

/** Where a new conversation in the same place starts: the project it worked in, or else the person's Chat. */
async function placePath(place: { ownerType: 'project' | 'user' | null; ownerId: string | null }): Promise<string> {
  if (place.ownerType === 'project' && place.ownerId) {
    try {
      const project = await getProject({ projectId: place.ownerId } as never) as { key: string; personalOwnerId: string | null }
      if (!project.personalOwnerId) return `/projects/${project.key}`
    } catch { /* fall back to Chat */ }
  }
  return '/chat'
}

interface PanelChatViewProps {
  sessionId: string
  mode?: 'panel' | 'full'
  onBack?: () => void
  onMaximizeToggle?: () => void
  hideHeader?: boolean
  /** Shown in place of the message box, ahead of the closed-conversation notice. */
  composerReplacement?: ReactNode
  agentAvatarUrl?: string | null
  agentName?: string
}

export function PanelChatView(props: PanelChatViewProps) {
  const { socket } = useSocket()
  const navigate = useNavigate()

  const triggerRunFn = useAction(triggerAgentRun)
  const cancelRunFn = useAction(cancelAgentRun)
  const updateSessionFn = useAction(updateSession)
  const approveFn = useAction(approveManifest)
  const rejectFn = useAction(rejectManifest)
  const tryAgainFn = useAction(tryAgain)
  const sendNowFn = useAction(sendWaitingMessageNow)
  const cancelWaitingFn = useAction(cancelWaitingMessage)
  const summariseFn = useAction(summariseConversation)
  const popupOpen = useConversationPopup()
  const links = useConversationLinks(props.sessionId)
  // The popup belongs to the conversation on screen.
  useEffect(() => () => setConversationPopup(false), [props.sessionId])

  // A closed conversation (adr-0076) keeps its history on screen but shows no
  // message box: read off every fetch of the session, so a run that closes it
  // swaps the box out as soon as the view refetches at the run's end.
  type Closed = {
    copy: NonNullable<ReturnType<typeof closedConversationCopy>>
    agentId: string | null
    place: { ownerType: 'project' | 'user' | null; ownerId: string | null }
  }
  const [closed, setClosed] = useState<Closed | null>(null)
  const [agentLabel, setAgentLabel] = useState<string | null>(null)
  const [starting, setStarting] = useState(false)
  // The project the conversation works in: a person made its Viewer since talks to its agents no more (adr-0102).
  const [projectId, setProjectId] = useState<string | null>(null)
  const mayWork = useMayWork(projectId)
  const noteClosed = (session: unknown) => {
    const s = session as (ClosedState & {
      agentId?: string | null
      agent?: { name: string } | null
      primaryOwnerType?: 'project' | 'user' | null
      primaryOwnerId?: string | null
    }) | null
    const copy = closedConversationCopy(s)
    setClosed(copy ? {
      copy,
      agentId: s?.agentId ?? null,
      place: { ownerType: s?.primaryOwnerType ?? null, ownerId: s?.primaryOwnerId ?? null },
    } : null)
    setAgentLabel(s?.agent?.name ?? null)
    setProjectId(s?.primaryOwnerType === 'project' ? s.primaryOwnerId ?? null : null)
    return session
  }
  // A new conversation with the same agent, in the box of the place it worked in.
  const startNewConversation = async () => {
    if (!closed?.agentId) return
    setStarting(true)
    try {
      navigate(newConversationPath(await placePath(closed.place), closed.agentId))
    } finally {
      setStarting(false)
    }
  }

  // Light wrapper for existing query refetch behaviour — pulls latest copy each call
  void useQuery  // not used directly; site's React Query cache will still invalidate via useAction

  return (
    <LiftedPanelChatView
      sessionId={props.sessionId}
      socket={socket as never}
      queries={{
        getSession: ((i: { id: string }) => getSession(i).then(noteClosed).then(withResolvedSessionAvatar)) as never,
        getSessionPendingManifest: ((i: { sessionId: string }) => getSessionPendingManifest(i)) as never,
      }}
      actions={{
        triggerAgentRun: triggerRunFn as never,
        cancelAgentRun: cancelRunFn as never,
        updateSession: updateSessionFn as never,
        approveManifest: approveFn as never,
        rejectManifest: rejectFn as never,
        tryAgain: tryAgainFn as never,
        sendWaitingMessageNow: sendNowFn as never,
        cancelWaitingMessage: cancelWaitingFn as never,
        summariseConversation: summariseFn as never,
      }}
      {...links}
      conversationPopup={{ open: popupOpen, onOpenChange: setConversationPopup }}
      renderMarkdown={(p) => <MarkdownMessage content={p.content} className={p.className} />}
      mode={props.mode}
      hideHeader={props.hideHeader}
      agentAvatarUrl={props.agentAvatarUrl}
      agentName={props.agentName}
      placeholder={agentLabel ? `Message ${agentLabel}…` : undefined}
      composerReplacement={props.composerReplacement ?? (closed
        ? <ClosedConversationNotice copy={closed.copy} onStartNew={() => void startNewConversation()} starting={starting || !closed.agentId} />
        : !mayWork ? <p className="px-4 py-3 text-small text-text-muted">{VIEWER_CANNOT_WORK}</p>
        : undefined)}
      onBack={props.onBack ?? (() => navigate('/chat'))}
      onMaximizeToggle={props.onMaximizeToggle}
    />
  )
}
