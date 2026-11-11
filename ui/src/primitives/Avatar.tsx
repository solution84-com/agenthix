import type { ImgHTMLAttributes } from 'react'

export interface AvatarProps extends ImgHTMLAttributes<HTMLImageElement> {
  size?: 'sm' | 'md' | 'lg'
  fallback?: string
}

/**
 * An initials mark (an agent's, a person's or an organisation's letters where it has no picture): identity, so it keeps
 * its colour, the avatar gradient with white letters, never the accent fill of the main button. The caller gives its
 * size, shape and type size.
 */
export const INITIALS_MARK = 'bg-gradient-to-br from-avatar-from to-avatar-to font-medium text-on-accent'

const SIZE = {
  sm: 'w-6 h-6 text-micro',
  md: 'w-8 h-8 text-small',
  lg: 'w-12 h-12 text-body',
}

export function Avatar({ size = 'md', fallback, src, alt = '', className = '', ...rest }: AvatarProps) {
  const base = `${SIZE[size]} rounded-full bg-surface-3 flex items-center justify-center text-text-secondary font-medium overflow-hidden ${className}`
  if (!src) return <div className={base}>{fallback ?? '?'}</div>
  return <img src={src} alt={alt} className={`${base} object-cover`} {...rest} />
}
