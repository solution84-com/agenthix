import { X } from 'lucide-react'
import type { CloudOfferName } from '@agenthix/core'
import { useCloudUrl, useOffers } from './platform'
import { cloudLinkOut, type CloudEntry, type CloudTask } from './linkOut'
import { CloudMark } from './CloudMark'
import { CLOUD } from './words'

const OFFERS: Record<CloudOfferName, { task: CloudTask; sentence: string; link: string }> = {
  site: { task: 'offer-site', sentence: `${CLOUD} can run sites for the organisation on its machines, with nothing to install.`, link: `Run a site on ${CLOUD} ↗` },
  backups: { task: 'offer-backups', sentence: `On ${CLOUD}, HQ's backups are kept away from the machine it runs on.`, link: 'Find out more ↗' },
  address: { task: 'offer-address', sentence: `On ${CLOUD}, HQ gets its own address with HTTPS, and no front door to look after.`, link: 'Find out more ↗' },
}

/**
 * One offer where Cloud removes a limit a fleet admin has hit (board *Offers*): one dismissible line, dismissed for
 * good per person. Shown only once hq has said it is not dismissed, and never by calling Cloud.
 */
export function CloudOfferLine({ offer, from }: { offer: CloudOfferName; from: CloudEntry }) {
  const { shows, dismiss } = useOffers()
  const cloudUrl = useCloudUrl()
  const href = cloudLinkOut(cloudUrl, { task: OFFERS[offer].task, from })
  if (!shows(offer) || !href) return null
  const { sentence, link } = OFFERS[offer]
  return (
    <aside aria-label={`${CLOUD} offer`} className="my-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl border border-dashed border-border bg-surface-1 px-3.5 py-2.5 text-small text-text-secondary">
      <CloudMark />
      <span className="min-w-0 flex-1">{sentence}</span>
      <a href={href} target="_blank" rel="noopener noreferrer" className="font-semibold text-text-primary underline underline-offset-2">{link}</a>
      <button type="button" aria-label="Dismiss this offer" onClick={() => void dismiss(offer)} className="rounded p-1 text-text-muted hover:bg-surface-hover">
        <X size={14} aria-hidden />
      </button>
    </aside>
  )
}
