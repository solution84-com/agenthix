import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { BUTTON_VARIANT, type ButtonVariant } from './buttonStyles'
import { DISABLED, FOCUS_RING, withoutHover } from './controlStyles'
import { Tooltip } from './Tooltip'
import { useRefusal, type Refusal } from './useRefusal'

type ButtonSize = 'sm' | 'md' | 'lg'

const SIZE: Record<ButtonSize, string> = {
  sm: 'px-2.5 py-1 text-micro font-button',
  md: 'min-h-9 px-4 py-1.5 text-body font-button max-sm:min-h-11',
  lg: 'px-5 py-2.5 text-body font-button',
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  leadingIcon?: ReactNode
  /** Refused for a reason known in advance: greyed but focusable, the reason in its tooltip, a press opens the dialog. */
  refusal?: Refusal
  children: ReactNode
}

export function Button({
  variant = 'primary',
  size = 'md',
  leadingIcon,
  className = '',
  disabled,
  refusal,
  children,
  ...rest
}: ButtonProps) {
  const refused = useRefusal(refusal)
  const look = refusal ? withoutHover(BUTTON_VARIANT[variant]) : BUTTON_VARIANT[variant]
  const button = (
    <button
      {...rest}
      {...refused.props}
      disabled={disabled}
      className={`rounded-button transition-colors flex items-center gap-1.5 ${DISABLED} ${FOCUS_RING} ${look} ${SIZE[size]} ${className}`}
    >
      {leadingIcon}
      {children}
    </button>
  )
  if (!refused.tooltip) return button
  return <><Tooltip label={refused.tooltip} side="top" wrap>{button}</Tooltip>{refused.dialog}</>
}
