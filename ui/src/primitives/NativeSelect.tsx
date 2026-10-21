import type { SelectHTMLAttributes } from 'react'

export interface NativeSelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'size'> {
  size?: 'sm' | 'md'
}

export function NativeSelect({ className = '', size = 'md', children, ...props }: NativeSelectProps) {
  const sizeClasses = size === 'sm' ? 'px-2.5 py-1.5 text-small' : 'px-3 py-2 text-body'
  // Full width unless the caller sets a width: both in one class list, `w-full` would win.
  const width = /(^|\s)w-/.test(className) ? '' : 'w-full'
  return (
    <select
      className={`${width} bg-surface-2 border border-border rounded-lg text-text-primary focus:outline-none focus:ring-1 focus:ring-accent transition-colors cursor-pointer [&>option]:bg-surface-1 ${sizeClasses} ${className}`}
      {...props}
    >
      {children}
    </select>
  )
}
