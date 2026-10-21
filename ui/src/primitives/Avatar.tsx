import type { ImgHTMLAttributes } from 'react'

export interface AvatarProps extends ImgHTMLAttributes<HTMLImageElement> {
  size?: 'sm' | 'md' | 'lg'
  fallback?: string
}

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
