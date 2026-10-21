import type { ButtonHTMLAttributes, ReactNode } from 'react'

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
type ButtonSize = 'sm' | 'md' | 'lg'

// What differs between portals is a token (tokens.css, "Buttons"): hq's values draw hq's buttons as they always were;
// the Fleet Console's give its gradient primary and its quiet outline danger. The outlines are inset rings, which
// take no room, so a ring hq draws transparent changes no size.
const VARIANT: Record<ButtonVariant, string> = {
  primary:   'bg-accent hover:bg-accent-hover bg-(image:--button-primary-image) hover:bg-none text-on-accent shadow-primary ring-1 ring-inset ring-button-primary-ring',
  secondary: 'bg-button-secondary hover:bg-surface-hover text-text-primary border border-border',
  ghost:     'text-text-muted hover:text-text-secondary hover:bg-surface-hover',
  danger:    'bg-button-danger hover:bg-button-danger-hover text-button-danger-text ring-1 ring-inset ring-button-danger-ring',
}

const SIZE: Record<ButtonSize, string> = {
  sm: 'px-2.5 py-1 text-micro font-button',
  md: 'px-4 py-2 text-body font-button',
  lg: 'px-5 py-2.5 text-body font-button',
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  leadingIcon?: ReactNode
  children: ReactNode
}

export function Button({
  variant = 'primary',
  size = 'md',
  leadingIcon,
  className = '',
  disabled,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      disabled={disabled}
      className={`rounded-button transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5 ${VARIANT[variant]} ${SIZE[size]} ${className}`}
    >
      {leadingIcon}
      {children}
    </button>
  )
}
