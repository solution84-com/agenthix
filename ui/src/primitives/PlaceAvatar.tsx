export interface PlaceAvatarProps {
  kind: 'project' | 'board'
  /** The item's stable id; the colour is derived from it. */
  id: string
  name: string
  size?: 'xs' | 'sm' | 'md' | 'lg'
  className?: string
}

const SIZE = {
  xs: { box: 'w-5 h-5 text-micro rounded-[5px]', mark: 11 },
  sm: { box: 'w-6 h-6 text-micro rounded-md', mark: 13 },
  md: { box: 'w-8 h-8 text-small rounded-lg', mark: 16 },
  lg: { box: 'w-10 h-10 text-body rounded-xl', mark: 20 },
}

// A mid-lightness colour keeps white lettering readable on any theme, so it is derived from the id, not a token.
export function placeAvatarColor(id: string): string {
  let hash = 0
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0
  return `hsl(${hash % 360} 55% 44%)`
}

export function placeAvatarInitial(name: string): string {
  return name.trim().charAt(0).toUpperCase() || '?'
}

export function PlaceAvatar({ kind, id, name, size = 'md', className = '' }: PlaceAvatarProps) {
  const { box, mark } = SIZE[size]
  return (
    <span
      className={`${box} inline-flex shrink-0 items-center justify-center font-semibold text-on-accent select-none ${className}`}
      style={{ backgroundColor: placeAvatarColor(id) }}
      aria-hidden="true"
    >
      {kind === 'board' ? (
        <svg viewBox="0 0 24 24" width={mark} height={mark} fill="none" stroke="currentColor" strokeWidth="2.4">
          <rect x="3" y="4" width="5" height="16" rx="1" />
          <rect x="10" y="4" width="5" height="11" rx="1" />
          <rect x="17" y="4" width="4" height="7" rx="1" />
        </svg>
      ) : (
        placeAvatarInitial(name)
      )}
    </span>
  )
}
