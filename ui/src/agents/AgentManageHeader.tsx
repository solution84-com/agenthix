import type { ReactNode } from 'react'
import { Camera } from 'lucide-react'
import { InlineEdit, ValueRefused } from '../primitives/InlineEdit'
import { FOCUS_RING } from '../primitives/controlStyles'
import { INITIALS_MARK } from '../primitives/Avatar'
import { getInitials } from './helpers'

export interface AgentManageHeaderActions {
  /**
   * Opens the host's picture picker on the avatar or the cover; left out for anyone who may not change the pictures.
   * The library holds no picture code of its own: the picker is the host's.
   */
  onOpenPicker?: (tab: 'avatar' | 'cover') => void
  /** Opens the avatar full size (the inspect view); left out while there is no picture. */
  onInspectAvatar?: () => void
  saveName: (name: string) => Promise<void>
  saveRole: (role: string) => Promise<void>
}

export interface AgentManageHeaderProps {
  agent: { id: string; name: string; handle: string; role: string | null; avatarUrl: string | null; coverUrl: string | null }
  actions: AgentManageHeaderActions
  /** Beside the handle: "the organisation's · Open its place in Agents ›". */
  subline?: ReactNode
  /** The right-hand end: Export and the ⋯ menu. */
  menu?: ReactNode
}

/**
 * The top of an agent's settings page (every screen reviewed spec §3): its cover with Change cover, its avatar with
 * Change, and its name and role edited in place. Clicking the avatar opens it full size; Change and the cover open the
 * host's picture picker.
 */
export function AgentManageHeader({ agent, actions, subline, menu }: AgentManageHeaderProps) {
  const { onOpenPicker, onInspectAvatar } = actions
  return (
    <div className="relative">
      <div className="relative h-40 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-accent/60 via-accent/40 to-transparent" />
        {agent.coverUrl && (
          <img
            src={agent.coverUrl}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
          />
        )}
        {onOpenPicker && (
          <>
            <button type="button" aria-hidden tabIndex={-1} onClick={() => onOpenPicker('cover')} className="absolute inset-0 cursor-pointer" />
            <button
              type="button"
              onClick={() => onOpenPicker('cover')}
              className={`absolute right-4 top-4 flex items-center gap-2 rounded-lg bg-scrim px-3 py-1.5 text-body font-medium text-text-primary ${FOCUS_RING}`}
            >
              <Camera className="h-4 w-4" />
              Change cover
            </button>
          </>
        )}
      </div>

      {/* Only the avatar overlaps the cover: the name and role start below it, readable on any cover. */}
      <div className="relative z-10 -mt-10 flex items-start gap-5 px-6 pb-4">
        <div className="relative h-20 w-20 shrink-0">
          <div className={`absolute inset-0 flex items-center justify-center rounded-full ring-4 ring-surface-0 ${INITIALS_MARK}`}>
            <span className="text-h1">{getInitials(agent.name)}</span>
          </div>
          {agent.avatarUrl && (
            <img src={agent.avatarUrl} alt="" className="absolute inset-0 h-20 w-20 rounded-full object-cover ring-4 ring-surface-0" />
          )}
          {(onInspectAvatar || onOpenPicker) && (
            <button
              type="button"
              aria-label={onInspectAvatar ? `${agent.name}'s picture, full size` : `Change ${agent.name}'s picture`}
              onClick={() => (onInspectAvatar ?? (() => onOpenPicker?.('avatar')))()}
              className={`absolute inset-0 cursor-pointer rounded-full ${FOCUS_RING}`}
            />
          )}
          {onOpenPicker && (
            <button
              type="button"
              onClick={() => onOpenPicker('avatar')}
              className="absolute -bottom-1 left-1/2 -translate-x-1/2 rounded-full border border-border bg-surface-1 px-2 py-0.5 text-micro font-medium text-text-secondary hover:text-text-primary"
            >
              Change
            </button>
          )}
        </div>

        <div className="min-w-0 flex-1 pt-12">
          <InlineEdit value={agent.name} onSave={async name => {
            if (!name.trim()) throw new ValueRefused('An agent needs a name. Nothing was changed.')
            await actions.saveName(name)
          }} textClassName="!px-0 !py-0 text-h1 font-medium" placeholder="Name" />
          <InlineEdit value={agent.role ?? ''} onSave={actions.saveRole} textClassName="!px-0 !py-0 text-body text-text-secondary" placeholder="Add a role" />
          <div className="mt-1 text-small text-text-muted">
            <span className="font-mono">@{agent.handle}</span>
            {subline && <span> · {subline}</span>}
          </div>
        </div>
        {menu && <div className="flex shrink-0 items-center gap-2 pt-12">{menu}</div>}
      </div>
    </div>
  )
}
