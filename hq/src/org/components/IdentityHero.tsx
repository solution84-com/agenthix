import type { ReactNode } from 'react'
import { Camera } from 'lucide-react'
import { AuthedImg } from '../../shared/components/AuthedImg'
import { AgentCover } from '../../agents/pages/AgentCover'
import { BUTTON_SECONDARY, FOCUS_RING } from '@agenthix/ui/primitives'

export type IdentityImage = 'avatar' | 'cover'

export interface IdentityHeroProps {
  name: string
  /** Under the name: "@acmecorp · on Agenthix since March 2026". */
  subline?: ReactNode
  avatarUrl: string | null
  coverUrl: string | null
  /** A person's picture is a circle; the organisation's and a team's a rounded square. */
  round?: boolean
  /** Opens the picture picker on that tab; left out for anyone who may not change the pictures: no Change. */
  onOpenPicker?: (tab: IdentityImage) => void
  /** Opens the avatar full size (the inspect view). */
  onInspectAvatar?: () => void
  /** The buttons at the right of the name: Edit, Add to a project, ⋯. */
  actions?: ReactNode
  /** Under the name, inside the hero: vision and mission. */
  children?: ReactNode
}

const BUTTON = `px-2.5 py-1 text-small rounded-lg font-medium ${BUTTON_SECONDARY}`

/**
 * An identity's top (every screen reviewed spec §3, Organisation: an identity always has a hero): its cover, a large
 * picture, its name and a line under it. The organisation, a team and a person each open with it. Change cover and
 * Change open the picture picker; the picture itself opens full size where the page offers it.
 */
export function IdentityHero({ name, subline, avatarUrl, coverUrl, round = false, onOpenPicker, onInspectAvatar, actions, children }: IdentityHeroProps) {
  const shape = round ? 'rounded-full' : 'rounded-2xl'
  return (
    <div data-testid="identity-hero">
      <div className="relative h-36 overflow-hidden sm:h-44">
        <AgentCover coverUrl={coverUrl} size="full" />
        {onOpenPicker && (
          <>
            <button type="button" aria-hidden tabIndex={-1} onClick={() => onOpenPicker('cover')} className="absolute inset-0 cursor-pointer" />
            <button type="button" onClick={() => onOpenPicker('cover')} className={`${BUTTON} absolute right-4 top-4 flex items-center gap-1.5`}>
              <Camera size={14} aria-hidden /> Change cover
            </button>
          </>
        )}
      </div>

      <div className="relative -mt-10 flex flex-wrap items-end gap-x-4 gap-y-2 px-4 lg:px-10">
        <div className="relative shrink-0">
          <span className={`relative flex h-20 w-20 items-center justify-center overflow-hidden ${shape} bg-surface-2 text-display font-medium text-text-primary ring-4 ring-surface-0 sm:h-24 sm:w-24`}>
            {name.trim().charAt(0).toUpperCase() || '?'}
            <AuthedImg src={avatarUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
          </span>
          {(onInspectAvatar || onOpenPicker) && (
            <button
              type="button"
              aria-label={onInspectAvatar ? `${name}'s picture, full size` : `Change ${name}'s picture`}
              onClick={() => (onInspectAvatar ? onInspectAvatar() : onOpenPicker?.('avatar'))}
              className={`absolute inset-0 cursor-pointer ${shape} ${FOCUS_RING}`}
            />
          )}
          {onOpenPicker && (
            <button type="button" onClick={() => onOpenPicker('avatar')}
              className={`absolute -bottom-1 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full border border-border bg-surface-1 px-2 py-0.5 text-micro font-medium text-text-secondary hover:text-text-primary ${FOCUS_RING}`}>
              Change
            </button>
          )}
        </div>
        <div className="min-w-0 flex-1 basis-48 pb-1 pt-10 sm:pt-12">
          <h1 className="truncate text-h1 font-medium text-text-primary">{name}</h1>
          {subline && <div className="truncate text-small text-text-muted">{subline}</div>}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2 pb-1 pt-10 sm:pt-12">{actions}</div>}
      </div>
      {children && <div className="px-4 pt-3 lg:px-10">{children}</div>}
    </div>
  )
}
