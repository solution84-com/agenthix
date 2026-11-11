import type { ReactNode } from 'react'
import type { CloudSiteSummary, CloudView, RemoteAccessView } from '@agenthix/core'
import { useCloudRead } from './api'
import { useCloudStale } from './useCloudStale'
import { cloudGroupState, type CloudGroupState } from './CloudGroup'

export type CloudFleet = {
  view: CloudView | null
  group: CloudGroupState | null
  remote: RemoteAccessView | null
  /** "Not up to date" for the Cloud group's meta line, when a held answer could not be read again. */
  stale: ReactNode
}

/** What the Fleet screen shows of Cloud; all null until each is read, and while the organisation is not connected. */
export function useCloudFleet(): CloudFleet {
  const view = useCloudRead<CloudView>('/cloud')
  const remote = useCloudRead<RemoteAccessView>('/remote-access')
  const linked = view.phase === 'ready' && view.value.organisation !== null && view.value.account !== null
  const sites = useCloudRead<{ sites: CloudSiteSummary[] }>(linked ? '/cloud/sites' : null)
  const viewStale = useCloudStale(view, 'Cloud')
  const sitesStale = useCloudStale(sites, "Cloud's sites")
  return {
    stale: viewStale ?? sitesStale,
    view: view.phase === 'ready' ? view.value : null,
    group: view.phase === 'ready' ? cloudGroupState(view.value, sites) : view.phase === 'failed' ? { kind: 'unreadable', message: view.message, error: view.error, retry: view.reload } : null,
    remote: remote.phase === 'ready' ? remote.value : null,
  }
}
