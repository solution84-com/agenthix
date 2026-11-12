import { useState, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate, useSearchParams } from 'react-router'
import { useQuery, getPersonCard } from 'wasp/client/operations'
import { PersonProfileCardView, type PersonCardData } from '@agenthix/ui/people'
import { AuthedPersonAvatar } from './AuthedPersonAvatar'
import { AuthedImg } from '../shared/components/AuthedImg'
import { orgPeoplePath } from './orgPeoplePaths'

/** A person's profile card, read when it opens. Inside a project, Show their tasks opens that project's Tasks tool. */
export function PersonProfileCard({ userId, projectId, onClose }: { userId: string; projectId?: string; onClose: () => void }) {
  const navigate = useNavigate()
  const [, setParams] = useSearchParams()
  const { data } = useQuery(getPersonCard, { userId, projectId })
  const card = data as PersonCardData | undefined
  if (!card) return null

  const showTasks = () => {
    onClose()
    setParams(prev => {
      const next = new URLSearchParams(prev)
      for (const name of ['task', 'view', 'at']) next.delete(name)
      next.set('tool', 'tasks')
      return next
    }, { replace: true })
  }

  return (
    <PersonProfileCardView
      card={card}
      avatar={<AuthedPersonAvatar person={card.person} size="lg" />}
      cover={<AuthedImg src={card.person.coverUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />}
      at={new Date()}
      onShowTasks={card.here ? showTasks : undefined}
      onManage={card.viewerIsOrgAdmin && card.person.state !== 'erased' ? () => { onClose(); navigate(orgPeoplePath(userId)) } : undefined}
      onClose={onClose}
    />
  )
}

/**
 * Wraps a person's name or picture so a click, or Enter, opens their profile card, built the way the agents'
 * trigger is: the card is drawn at the end of the page and its clicks stop here, so the trigger sits safely
 * inside a link or a button. `projectId` adds their role and tasks in that project.
 */
export function PersonProfileTrigger({ userId, projectId, children }: { userId: string; projectId?: string; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const show = (e: MouseEvent | KeyboardEvent) => { e.preventDefault(); e.stopPropagation(); setOpen(true) }
  return (
    <>
      <span
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
          <PersonProfileCard userId={userId} projectId={projectId} onClose={() => setOpen(false)} />
        </div>,
        document.body,
      )}
    </>
  )
}
