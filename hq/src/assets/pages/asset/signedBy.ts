import { AGENTHIX_PUBLISHER } from '@agenthix/core'
import { signedByText } from '../../../library/assetList/words'

/** How the page says who vouches for it, in the words of the install states (spec part 3). */
export function signedByWords(v: { source: string; trustedPublisher: { displayName: string; repository: string | null } | null }, publisher: string, builtIn: boolean, own: boolean): string {
  if (builtIn) return 'Built in to HQ: it never leaves HQ, so it needs no signature'
  if (own || v.source === 'MADE_HERE') return 'Made here: it never left HQ, so it needs no signature'
  if (v.trustedPublisher) return signedByText(v.trustedPublisher.displayName, v.trustedPublisher.repository)
  if (v.source === 'BUILT_IN' && publisher === AGENTHIX_PUBLISHER) return 'Signed by Agenthix'
  return 'Unsigned: nobody vouches for who made it or whether it was changed'
}
