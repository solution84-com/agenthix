import { RELAY_ASSIGN_METHOD } from '@agenthix/core'
// A cycle, as reconcileService.ts's: the site channel calls this on connect, and this asks the site channel. Every
// binding across it is read at call time, never at module load.
import { siteChannelRegistry } from '../sites/channel'
import { createRelayAssigner } from './relayAssignment'
import { placeSite } from './placement'
import { signRelayPass } from './relayTokens'

/** Sends each site that connects its relay and pass, and renews the pass (relayAssignment.ts). */
export const relayAssigner = createRelayAssigner({
  connection: siteId => siteChannelRegistry.get(siteId),
  request: (siteId, params) => siteChannelRegistry.request(siteId, RELAY_ASSIGN_METHOD, params),
  place: placeSite,
  signPass: signRelayPass,
})
