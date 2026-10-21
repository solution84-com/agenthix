import type { ReactNode } from 'react'
import { Link } from '../router'

/**
 * A card that shows a thing and is one link as a whole (board *Proposal*, 3): pressing anywhere on it opens the thing's
 * page, it highlights on hover and on keyboard focus, and Enter opens it as any link does. Nothing inside it may be a
 * second link or a button; an action of the card's sits beside it, outside the link. The caller gives the card its frame and layout.
 */
export function CardLink({ to, labelledBy, className = '', children }: { to: string; labelledBy: string; className?: string; children: ReactNode }) {
  return (
    <Link
      to={to}
      aria-labelledby={labelledBy}
      className={`cursor-pointer transition-colors hover:border-border-strong hover:bg-surface-hover focus-visible:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${className}`}
    >
      {children}
    </Link>
  )
}
