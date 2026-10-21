import { AuthLayout } from './AuthLayout'
import { Heading, PRIMARY, SECONDARY } from './authUi'
import type { ShownIdentity } from './orgCard'

/** Opening an invitation while signed in: never a silent switch. */
export function SwitchPerson({ identity, signedInAs, busy, onContinue, onCancel }: {
  identity: ShownIdentity | null
  signedInAs: string
  busy: boolean
  onContinue: () => void
  onCancel: () => void
}) {
  return (
    <AuthLayout identity={identity}>
      <Heading title={`You're signed in as ${signedInAs}`} lead={`This invitation is for someone new. Continuing signs ${signedInAs} out in this browser.`} />
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={busy} onClick={onContinue} className={`${PRIMARY} w-auto`}>Sign out and continue</button>
        <button type="button" disabled={busy} onClick={onCancel} className={SECONDARY}>Cancel</button>
      </div>
    </AuthLayout>
  )
}
