import type { ReactNode } from 'react'

export interface FormFieldProps {
  label: string
  htmlFor?: string
  error?: string
  hint?: string
  children: ReactNode
}

export function FormField({ label, htmlFor, error, hint, children }: FormFieldProps) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-small font-medium text-text-secondary">
        {label}
      </label>
      {children}
      {hint && <p className="text-small text-text-muted">{hint}</p>}
      {error && <p className="text-small text-danger">{error}</p>}
    </div>
  )
}
