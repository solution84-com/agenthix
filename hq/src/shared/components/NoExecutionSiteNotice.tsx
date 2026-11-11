import { Link } from 'react-router'
import { useQuery, getExecutionSites, getUserSettings } from 'wasp/client/operations'
import { UnansweredSitesNotice, FOCUS_RING } from '@agenthix/ui/primitives'
import { NO_EXECUTION_SITE_NOTICE, hasNoExecutionSite } from '../noExecutionSite'
import { CloudOffer } from './CloudOfferLine'

/**
 * True once the registry has loaded and names no usable Execution Site — the
 * condition under which reads come back empty and actions refuse.
 */
export function useNoExecutionSite(): boolean {
  const { data } = useQuery(getExecutionSites)
  return hasNoExecutionSite(data)
}

/**
 * Says why a site-backed view is empty when the reason is that there is no
 * site at all. Distinct from `UnansweredSitesNotice`'s "a site did not
 * answer": with nobody to ask, nothing failed to reply. It borrows that
 * component's look because the two are the same kind of message.
 */
export function NoExecutionSiteNotice({ className }: { className?: string }) {
  const noSite = useNoExecutionSite()
  const { data: mySettings } = useQuery(getUserSettings)
  if (!noSite) return null
  return (
    <div className={className}>
      <UnansweredSitesNotice copy={{ headline: NO_EXECUTION_SITE_NOTICE, sites: [] }} />
      {mySettings && (
        <p className="mt-1.5 text-small text-text-secondary">
          {mySettings.role === 'ADMIN' ? (
            <Link to="/admin/where-work-runs" className={`rounded text-link hover:underline ${FOCUS_RING}`}>Where work runs</Link>
          ) : (
            'Ask a fleet admin to add one in the Fleet Console.'
          )}
        </p>
      )}
      <CloudOffer offer="site" />
    </div>
  )
}
