import type { Dot } from './menu'

const DOT: Record<Dot, string> = {
  healthy: 'bg-success',
  attention: 'bg-warning',
  silent: 'bg-text-muted',
  none: 'border border-text-muted bg-transparent',
}

/** A thing's state as a dot; the state's words go beside it for anyone who cannot see the colour. */
export function StateDot({ dot, className = '' }: { dot: Dot; className?: string }) {
  return <span aria-hidden data-dot={dot} className={`inline-block size-2 flex-none rounded-full ${DOT[dot]} ${className}`} />
}
