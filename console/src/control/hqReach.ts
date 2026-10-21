/**
 * Whether HQ lets this Fleet Console in, for `handover-status`. A Fleet Console retired while its machine was outside
 * the fleet is never told so by a certificate; it hears only HQ refusing its credential. The host service on its
 * machine shows that in `agenthix status`, and leaves taking it away to the machine admin: HQ's word alone never
 * removes it.
 */
import type { HqLink, LinkState } from '../hq/link'

/** `refused` holds from HQ's refusal until HQ lets it in again, through the attempts in between. */
export type HqReach = 'connected' | 'refused' | 'notConnected'

export function watchHqReach(link: HqLink): () => HqReach {
  let refused = link.state === 'refused'
  link.on('state', (state: LinkState) => {
    if (state === 'refused') refused = true
    else if (state === 'connected') refused = false
  })
  return () => link.state === 'connected' ? 'connected' : refused ? 'refused' : 'notConnected'
}
