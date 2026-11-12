import { AuthedImg } from '../../shared/components/AuthedImg'
import type { PictureSize } from '../../shared/utils/agentImageUrl'

/**
 * An agent's cover across the top of a card or a place; a gradient of the accent sits under it, since the image loads
 * with a session. A card shows the small copy; a page's header band asks for `full`.
 */
export function AgentCover({ coverUrl, size = 'small' }: { coverUrl: string | null; size?: PictureSize }) {
  return (
    <>
      <div className="absolute inset-0" style={{ background: 'linear-gradient(135deg, color-mix(in srgb, var(--color-accent) 25%, var(--color-surface-2)) 0%, var(--color-surface-3) 100%)' }} />
      {coverUrl && <AuthedImg src={coverUrl} size={size} alt="" className="absolute inset-0 h-full w-full object-cover" />}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-surface-1" />
    </>
  )
}
