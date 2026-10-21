import { BRANDING } from '@agenthix/core'
import { PILL_SHAPE } from './StatePill'

// Where a site runs (U3): the same badge in HQ, the Fleet Console and Cloud. Self-hosted is a plain fact, in the
// neutral chip; Cloud's badge is in Cloud's own blue, shared by every portal.
export type Hosting = 'self-hosted' | 'cloud'

export function hostingLabel(where: Hosting, short = false): string {
  if (where === 'self-hosted') return 'Self-hosted'
  return short ? 'Cloud' : `${BRANDING.displayName} Cloud`
}

export interface HostingBadgeProps {
  where: Hosting
  /** "Cloud" rather than the full name, for a row where the name is said nearby. */
  short?: boolean
}

export function HostingBadge({ where, short = false }: HostingBadgeProps) {
  return (
    <span className={`${PILL_SHAPE} ${where === 'cloud' ? 'bg-cloud-subtle text-cloud' : 'bg-chip text-text-secondary'}`}>
      {hostingLabel(where, short)}
    </span>
  )
}
