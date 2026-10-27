import type { ReactEventHandler } from 'react'
import { useAgentImageUrl } from '../hooks/useAgentImageUrl'

/**
 * A plain <img> for an uploaded picture (an avatar or a cover), loaded from
 * HQ's relay by a link HQ makes for the person (adr-0153). Resolves the raw
 * stored path through the shared cache and renders
 * nothing until it resolves — including if that fails, since a failed
 * resolution is never cached as a value this component could render (see
 * agentImageUrl.ts). The caller must render its own fallback (a gradient,
 * initials) unconditionally underneath, not only when `src` is absent: a
 * present `src` can still take a moment to resolve, or fail outright, and
 * until it succeeds this component is invisible.
 */
export function AuthedImg({
  src,
  alt = '',
  className,
  onError,
}: {
  src: string | null | undefined
  alt?: string
  className?: string
  onError?: ReactEventHandler<HTMLImageElement>
}) {
  const resolvedSrc = useAgentImageUrl(src)
  if (!resolvedSrc) return null
  return <img src={resolvedSrc} alt={alt} className={className} onError={onError} />
}
