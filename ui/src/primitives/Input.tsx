import type { InputHTMLAttributes } from 'react'
import { FIELD } from './controlStyles'

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {}

export function Input({ className = '', ...rest }: InputProps) {
  return (
    <input
      {...rest}
      className={`w-full ${FIELD} rounded-lg px-3 py-2 text-body ${className}`}
    />
  )
}
