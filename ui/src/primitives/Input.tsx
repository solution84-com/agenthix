import type { InputHTMLAttributes } from 'react'

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {}

export function Input({ className = '', ...rest }: InputProps) {
  return (
    <input
      {...rest}
      className={`w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-body text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent ${className}`}
    />
  )
}
