import type { SelectHTMLAttributes } from 'react'
import { ChevronDownGlyph } from './Glyphs'
import { CONTROL_HEIGHT } from './controlStyles'

export interface NativeSelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'size'> {
  size?: 'sm' | 'md'
}

/**
 * The one select: the browser's own list of choices, drawn as every field is (white, bordered, 36 px, 44 px on a
 * phone) with the app's chevron in place of the operating system's. `className` places it (width, margins).
 */
export function NativeSelect({ className = '', size = 'md', children, ...props }: NativeSelectProps) {
  const sizeClasses = size === 'sm' ? 'pl-2.5 text-small' : 'pl-3 text-body'
  // Full width unless the caller sets a width: both in one class list, `w-full` would win.
  const width = /(^|\s)!?w-/.test(className) ? 'inline-block' : 'block w-full'
  return (
    <span className={`relative ${width} ${className}`}>
      <select
        className={`${CONTROL_HEIGHT} w-full cursor-pointer appearance-none rounded-lg border border-border bg-surface-1 pr-8 text-text-primary transition-colors focus:outline-none focus:ring-1 focus:ring-accent disabled:cursor-not-allowed disabled:opacity-60 [&>option]:bg-surface-1 ${sizeClasses}`}
        {...props}
      >
        {children}
      </select>
      <ChevronDownGlyph size={14} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted" />
    </span>
  )
}
