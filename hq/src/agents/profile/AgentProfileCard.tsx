import { useRef, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useLocation, useNavigate } from 'react-router'
import { useQuery, getAgentProfile, getAgentCardHere } from 'wasp/client/operations'
import { ProfileCard, type AgentFactsData, type AgentNowData, type ProfileCardHereRow } from '@agenthix/ui/agents'
import { AuthedAgentAvatar } from '../../shared/components/AuthedAgentAvatar'
import { useAgentImageUrl } from '../../shared/hooks/useAgentImageUrl'
import { useIsMobile } from '../../shared/hooks/useIsMobile'
import { CHAT_PATH } from '../../chat/chatComposer'
import { modelLabel } from './modelLabel'
import { agentAtPart, useCardPlace } from './cardPlace'
import { newConversationPath } from '../../conversations/threadPaths'

type Profile = { agent: AgentFactsData; now: AgentNowData; projectCount: number }
type CardHere = { narrowedCount: number; openTasks: unknown[] }

const narrowed = (n: number) => (n === 0 ? 'None narrowed' : `${n} narrowed`)

/**
 * An agent's card, read when it opens (`getAgentProfile` asks no site). New conversation starts one where the
 * person is: in the project they are in, else in their Chat. Inside a project or Chat the card also offers
 * what they can do with the agent there.
 */
export function AgentProfileCard({ agentId, anchor, onClose }: { agentId: string; anchor: HTMLElement | null; onClose: () => void }) {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const mobile = useIsMobile()
  const place = useCardPlace()
  const { data } = useQuery(getAgentProfile, { agentId })
  const { data: here } = useQuery(getAgentCardHere, { agentId, projectId: place?.kind === 'project' ? place.projectId : null }, { enabled: !!place })
  const profile = data as Profile | undefined
  const cover = useAgentImageUrl(profile?.agent.coverUrl)
  if (!profile) return null
  const { agent } = profile

  // The box of the place the person is in, with this agent picked.
  const newConversation = () => {
    onClose()
    navigate(newConversationPath(place?.kind === 'project' ? place.basePath : CHAT_PATH, agentId))
  }

  const goTo = (focus: 'permissions' | 'tasks') => { onClose(); navigate(agentAtPart(place?.path ?? pathname, agentId, focus)) }
  const card = here as CardHere | undefined
  const rows: ProfileCardHereRow[] = !place || !card ? [] : place.kind === 'project'
    ? [
        { label: 'Permissions here', value: narrowed(card.narrowedCount), onOpen: () => goTo('permissions') },
        { label: 'Its tasks here', value: `${card.openTasks.length} open`, onOpen: () => goTo('tasks') },
      ]
    : [
        { label: 'Your permissions in Chat', value: narrowed(card.narrowedCount), onOpen: () => goTo('permissions') },
      ]

  return (
    <>
      <ProfileCard
        agent={agent}
        coverSrc={cover}
        avatar={<AuthedAgentAvatar name={agent.name} avatarUrl={agent.avatarUrl} size="lg" />}
        now={profile.now}
        projectCount={profile.projectCount}
        modelLabel={modelLabel(agent.defaultModel, agent.runtime)}
        at={new Date()}
        anchor={anchor}
        mobile={mobile}
        here={rows.length > 0 ? { heading: place?.kind === 'project' ? 'In this project' : 'In your Chat', rows } : null}
        onNewConversation={newConversation}
        onOpenPlace={() => { onClose(); navigate(`/agents/${agent.handle}`) }}
        onClose={onClose}
      />
    </>
  )
}

/**
 * Wraps an agent's name or picture so a click, or Enter, opens its card beside it. The card is drawn at the end
 * of the page and its clicks stop here, so the trigger sits safely inside a link or a button.
 */
export function AgentProfileTrigger({ agentId, children }: { agentId: string; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const trigger = useRef<HTMLSpanElement>(null)
  const show = (e: MouseEvent | KeyboardEvent) => { e.preventDefault(); e.stopPropagation(); setOpen(true) }
  return (
    <>
      <span
        ref={trigger}
        role="button" tabIndex={0} title="Open profile"
        onClick={show}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') show(e) }}
        onPointerDown={e => e.stopPropagation()}
        className="cursor-pointer rounded hover:opacity-80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
      >
        {children}
      </span>
      {open && createPortal(
        <div onClick={e => e.stopPropagation()} onPointerDown={e => e.stopPropagation()}>
          <AgentProfileCard agentId={agentId} anchor={trigger.current} onClose={() => setOpen(false)} />
        </div>,
        document.body,
      )}
    </>
  )
}
