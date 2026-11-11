import { useNavigate } from 'react-router'
import { useQuery, getExecutionSites, getUserSettings } from 'wasp/client/operations'
import { Nudge } from '@agenthix/ui/attention'
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
 * site at all: a quiet line in the view's meta line (a nudge), never a dialog.
 * Distinct from "a site did not answer": with nobody to ask, nothing failed to
 * reply. An admin is offered Where work runs; anyone else is told who adds one.
 */
export function NoExecutionSiteNotice({ className }: { className?: string }) {
  const noSite = useNoExecutionSite()
  const { data: mySettings } = useQuery(getUserSettings)
  const navigate = useNavigate()
  if (!noSite) return null
  const admin = mySettings?.role === 'ADMIN'
  return (
    <div className={className}>
      <Nudge place="meta" action={admin ? { label: 'Where work runs', onClick: () => navigate('/admin/where-work-runs') } : undefined}>
        {NO_EXECUTION_SITE_NOTICE}.{mySettings && !admin && ' Ask a fleet admin to add one in the Fleet Console.'}
      </Nudge>
      <CloudOffer offer="site" />
    </div>
  )
}
