/**
 * The picker's own preview (boards/picker.html): the card, cover and avatar together, showing both tabs' choices at
 * once and marked "not saved yet"; the page behind it changes only on Save. Under it, the tab's buttons.
 */
import type { ReactNode } from 'react'
import type { PictureContext } from '../recipe'
import { ShownPicture, initialsOf } from './PictureView'
import type { PickerTab, Shown } from './pickerState'
import { INITIALS_MARK } from '@agenthix/ui/primitives'

export function PreviewCard({ ctx, role, avatar, cover, tab, round, children }: {
  ctx: PictureContext
  role?: string | null
  avatar: Shown
  cover: Shown
  tab: PickerTab
  round: boolean
  /** The buttons under the card. */
  children: ReactNode
}) {
  const shape = round ? 'rounded-full' : 'rounded-2xl'
  return (
    <div>
      <p className="mb-1.5 text-small text-text-muted">Preview · not saved yet</p>
      <div className="overflow-hidden rounded-xl border border-border bg-surface-1" data-testid="picker-preview">
        <div className={`relative h-16 ${tab === 'cover' ? 'inset-ring-2 inset-ring-text-primary' : ''}`}>
          <ShownPicture shown={cover} kind="cover" ctx={ctx} />
        </div>
        <div className="-mt-10 px-2.5 pb-2.5">
          <div className={`relative h-[88px] w-[88px] overflow-hidden border-[3px] border-surface-1 ${shape} ${tab === 'avatar' ? 'outline-2 outline-offset-1 outline-solid outline-text-primary' : ''}`}>
            <ShownPicture
              shown={avatar} kind="avatar" ctx={ctx}
              fallback={<span className={`absolute inset-0 flex items-center justify-center ${INITIALS_MARK} text-h2`}>{initialsOf(ctx.subject.name)}</span>}
            />
          </div>
          <p className="mt-1 truncate text-body font-medium text-text-primary">{ctx.subject.name}</p>
          {role && <p className="truncate text-small text-text-muted">{role}</p>}
        </div>
      </div>
      <div className="mt-2.5 flex flex-col gap-1.5">{children}</div>
    </div>
  )
}
