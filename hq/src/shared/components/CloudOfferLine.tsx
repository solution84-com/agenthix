import { useState } from 'react'
import { useQuery, getMyCloudOffers, dismissCloudOffer, getOrgIdentity } from 'wasp/client/operations'
import { hostingLabel, FOCUS_RING } from '@agenthix/ui/primitives'
import { CLOUD_PATHS, cloudLinkOut, type CloudOffer } from '../cloudLinks'
import { useFeature } from '../../features/useFeature'

/** One dismissible line: Cloud's name on its sunrise, a sentence on what Cloud changes here, a link out, and × to dismiss. */
export function CloudOfferLine({ sentence, linkLabel, href, onDismiss }: { sentence: string; linkLabel: string; href: string; onDismiss: () => void }) {
  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-dashed border-border bg-card px-3 py-2 text-small text-text-secondary">
      <span className="rounded-full bg-linear-90 from-sunrise-from via-sunrise-via to-sunrise-to px-2.5 py-0.5 text-micro font-medium text-on-sunrise">{hostingLabel('cloud')}</span>
      <span className="min-w-0 flex-1">{sentence}</span>
      <a href={href} className={`rounded font-medium text-link hover:underline ${FOCUS_RING}`}>{linkLabel} ↗</a>
      <button type="button" aria-label="Dismiss" onClick={onDismiss} className="text-text-muted hover:text-text-primary">×</button>
    </div>
  )
}

/**
 * An offer of Agenthix Cloud where it removes a limit, to a fleet admin only and until they dismiss it: gone for good,
 * for that person and that offer. Members see nothing; nothing here calls Cloud.
 */
export function CloudOffer({ offer }: { offer: CloudOffer }) {
  const on = useFeature('cloud')
  const { data, refetch } = useQuery(getMyCloudOffers, undefined, { enabled: on })
  const { data: org } = useQuery(getOrgIdentity)
  const [gone, setGone] = useState(false)
  if (!on || !data || !data.fleetAdmin || gone || data.dismissed.includes(offer)) return null
  const href = cloudLinkOut(data.cloudOrigin, CLOUD_PATHS.sites, { from: 'hq-offer', task: `offer-${offer}`, returnPath: window.location.pathname })
  if (!href) return null
  return (
    <CloudOfferLine
      sentence={`Agenthix Cloud can run sites for ${org?.name || 'your organisation'} on its machines, with nothing to install.`}
      linkLabel="Run a site on Agenthix Cloud"
      href={href}
      onDismiss={() => {
        setGone(true)
        void dismissCloudOffer({ offer }).then(() => refetch(), () => setGone(false))
      }}
    />
  )
}
