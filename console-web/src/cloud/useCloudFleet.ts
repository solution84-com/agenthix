import type { CloudSiteSummary, CloudView, RemoteAccessView } from '@agenthix/core'
import { useCloudRead } from './api'
import { cloudGroupState, type CloudGroupState } from './CloudGroup'

export type CloudFleet = {
  view: CloudView | null
  group: CloudGroupState | null
  remote: RemoteAccessView | null
}

/** What the Fleet screen shows of Cloud; all null until each is read, and while the organisation is not connected. */
export function useCloudFleet(): CloudFleet {
  const view = useCloudRead<CloudView>('/cloud')
  const remote = useCloudRead<RemoteAccessView>('/remote-access')
  const linked = view.phase === 'ready' && view.value.organisation !== null && view.value.account !== null
  const sites = useCloudRead<{ sites: CloudSiteSummary[] }>(linked ? '/cloud/sites' : null)
  return {
    view: view.phase === 'ready' ? view.value : null,
    group: view.phase === 'ready' ? cloudGroupState(view.value, sites) : view.phase === 'failed' ? { kind: 'unreadable', message: view.message } : null,
    remote: remote.phase === 'ready' ? remote.value : null,
  }
}
