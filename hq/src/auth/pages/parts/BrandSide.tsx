import type { ReactNode } from 'react'
import { BRANDING } from '@agenthix/core'

/** The product's mark (the hexagon from hq's favicon), drawn in the current text colour. */
export function AgenthixMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 580 580" fill="currentColor" aria-hidden className={className}>
      <g transform="translate(-250 -250)">
        <path d="M540,816.7c-9.2,0-18.4-2.4-26.7-7.1L319.2,697.9c-16.5-9.5-26.8-27.3-26.8-46.3V428.4 c0-19.1,10.3-36.8,26.8-46.3l194.1-111.7c16.4-9.5,36.9-9.5,53.3,0l194.1,111.7c16.5,9.5,26.8,27.3,26.8,46.3v223.1 c0,19.1-10.3,36.8-26.8,46.3L566.7,809.6C558.4,814.3,549.2,816.7,540,816.7z M540,304.5c-2.1,0-4.2,0.5-6.1,1.6L339.7,417.8 c-3.8,2.2-6.2,6.3-6.2,10.7v223.1c0,4.4,2.4,8.5,6.2,10.7l194.1,111.7c3.8,2.2,8.5,2.2,12.3,0l194.1-111.7 c3.8-2.2,6.2-6.3,6.2-10.7V428.4c0-4.4-2.4-8.5-6.2-10.7L546.1,306.1C544.2,305,542.1,304.5,540,304.5z" />
        <polygon points="426.4,571.8 535.9,370.5 650.9,569 577.9,528.4 537.5,459.9 501.7,524.5" />
        <polygon points="395.3,625.5 539.4,540.9 681.8,625.5 639.2,651.8 539.4,592.8 440.2,650" />
      </g>
    </svg>
  )
}

/**
 * Setup's panel while the organisation has no picture or cover of its own: our mark and name, large, in the centre of a
 * branded cover, with what this is under them. Screen only; the name is never stored.
 */
export function BrandSide({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div data-testid="brand-side" className="relative flex flex-col items-center justify-center bg-accent px-5 py-10 text-center text-on-accent lg:min-h-screen lg:px-10">
      <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-scrim to-transparent" />
      <div className="relative flex flex-col items-center">
        <AgenthixMark className="h-16 w-16 lg:h-24 lg:w-24" />
        <span className="mt-3 text-h1 font-bold lg:text-display">{BRANDING.displayName}</span>
        <div className="mt-6 text-h2 font-bold lg:mt-8">{title}</div>
        {children && <div className="mt-2 max-w-[440px] text-body opacity-90 lg:text-reading">{children}</div>}
      </div>
    </div>
  )
}

/** The panel beside setup's first step, on the first-admin page and when the step is reviewed. */
export function FreshHqSide() {
  return <BrandSide title="A fresh HQ">Three short steps: you, your organisation, and how agents reach a model. Then you start talking to the built-in agent, which helps with the rest.</BrandSide>
}
