import type { TextareaHTMLAttributes } from 'react'
import { FIELD } from './controlStyles'

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {}

export function Textarea({ className = '', ...rest }: TextareaProps) {
  return (
    <textarea
      {...rest}
      className={`w-full ${FIELD} rounded-lg px-3 py-2 text-body resize-none ${className}`}
    />
  )
}
