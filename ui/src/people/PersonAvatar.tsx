import { Avatar } from '../primitives/Avatar'
import { placeAvatarColor, placeAvatarInitial } from '../primitives/PlaceAvatar'

const SIZE = { sm: 'w-6 h-6 text-micro', md: 'w-8 h-8 text-small', lg: 'w-12 h-12 text-body' }

/**
 * A person's picture, else their initial on a colour derived from their id. `src` is the picture once hq can
 * show it (the stored path needs the signed-in fetch), so it is null while loading and for no picture.
 */
export function PersonAvatar({ person, src, size = 'md' }: {
  person: { userId: string; name: string }
  src: string | null
  size?: 'sm' | 'md' | 'lg'
}) {
  if (src) return <Avatar src={src} alt={person.name} size={size} />
  return (
    <span
      aria-hidden="true"
      className={`${SIZE[size]} inline-flex shrink-0 items-center justify-center rounded-full font-medium text-on-accent select-none`}
      style={{ backgroundColor: placeAvatarColor(person.userId) }}
    >
      {placeAvatarInitial(person.name)}
    </span>
  )
}
