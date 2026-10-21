import { BRANDING } from '@agenthix/core'
import type { ComponentProps } from 'react'
import { Logomark } from './Logomark'
import { Wordmark } from './Wordmark'

type LogoProps = ComponentProps<'div'> & {
  /** Logomark size in px — the wordmark sits below it, auto-sized to ~0.5× this value. */
  size?: number
}

export function Logo({ size = 64, style, ...props }: LogoProps) {
  const wordmarkHeight = Math.round(size * 0.5)
  const wordmarkWidth = (790 / 200) * wordmarkHeight
  const gap = Math.round(size * 0.18)

  return (
    <div
      aria-label={BRANDING.displayName}
      role="img"
      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap, ...style }}
      {...props}
    >
      <Logomark width={size} height={size} aria-hidden="true" style={{ color: 'var(--color-accent)' }} />
      <Wordmark width={wordmarkWidth} height={wordmarkHeight} aria-hidden="true" aria-label={undefined} />
    </div>
  )
}
