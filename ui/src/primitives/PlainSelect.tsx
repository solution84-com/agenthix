import type { SelectHTMLAttributes } from 'react'
import { ChevronDown } from 'lucide-react'
import { CONTROL_HEIGHT, PLAIN_CONTROL } from './controlStyles'

export interface PlainSelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  /** In a toolbar row, the height of every control there (36 px); in a menu, 32 px. Both 44 px on a phone. */
  toolbar?: boolean
}

/**
 * A picker inside a menu or a toolbar: plain text, a label and a chevron, a hover fill and no box (a boxed select is
 * for a form field only).
 */
export function PlainSelect({ className = '', toolbar = false, children, ...props }: PlainSelectProps) {
  return (
    <span className={`relative inline-block ${className}`}>
      <select
        className={`${toolbar ? CONTROL_HEIGHT : 'h-8 max-sm:h-11'} w-full cursor-pointer appearance-none truncate bg-transparent pl-2.5 pr-7 ${PLAIN_CONTROL} [&>option]:bg-popover`}
        {...props}
      >
        {children}
      </select>
      <ChevronDown size={14} aria-hidden className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-text-muted" />
    </span>
  )
}
