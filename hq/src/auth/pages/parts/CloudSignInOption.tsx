import { useEffect, useState } from 'react'
import { FormError, SECONDARY } from './authUi'
import { hqOf } from './orgCard'
import { readCloudSignInConnected, startCloudSignIn } from './cloudSignInApi'

/** Where the button is drawn: the sign-in page, an invitation (making an account), or setup's first step. */
export type CloudSignInPlace = 'signIn' | 'invite' | 'setup'

export function cloudNotConnectedReason(org: string | null, place: CloudSignInPlace): string {
  return place === 'setup'
    ? 'Not turned on for this HQ yet. A fleet admin can turn it on after setup.'
    : `Not turned on for ${hqOf(org)}. Sign in with your username and password.`
}

export const ACCEPT_FIRST = 'Accept the invitation with a username and password first. Then link your Agenthix account in Settings › Sign-in.'

/**
 * *Sign in with Agenthix Cloud*, under the form: always shown, working when hq is connected, otherwise greyed out
 * with its reason beneath. The page is public, so it carries no link to Cloud; hq starts the sign-in. On an invitation
 * or setup's first step, choosing it only says to accept with a password first: Cloud never makes an account here.
 */
export function CloudSignInOption({ org = null, place = 'signIn', start = startCloudSignIn }: {
  org?: string | null
  place?: CloudSignInPlace
  start?: typeof startCloudSignIn
}) {
  const [connected, setConnected] = useState<boolean | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => { void readCloudSignInConnected().then(setConnected) }, [])

  async function go() {
    if (place !== 'signIn') { setError(ACCEPT_FIRST); return }
    setBusy(true)
    setError('')
    const refusal = await start('signIn')
    if (refusal) {
      setError(refusal)
      setBusy(false)
    }
  }

  return (
    <div className="mt-4 border-t border-border-subtle pt-4">
      {error && (place === 'signIn' ? <FormError>{error}</FormError> : <p role="status" className="mb-3 text-small text-text-secondary">{error}</p>)}
      <button type="button" className={`${SECONDARY} w-full`} disabled={connected !== true || busy} onClick={() => void go()}>
        Sign in with Agenthix Cloud
      </button>
      {connected === false && <p className="mt-1.5 text-center text-small text-text-muted">{cloudNotConnectedReason(org, place)}</p>}
    </div>
  )
}
