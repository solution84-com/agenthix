import { useState } from 'react'
import { logout } from 'wasp/client/auth'
import { Button } from '@agenthix/ui/primitives'
import { ChangePasswordForm } from './ChangePasswordForm'
import { SettingsRow } from './SettingsSection'
import { CloudAccountRow } from './CloudAccountRow'
import { PledgeRow } from './PledgeRow'

/** Settings › Sign-in: changing the password, the linked Agenthix account and its pledge signature, and signing out of this browser. */
export function SignInSection() {
  const [changing, setChanging] = useState(false)
  const [changed, setChanged] = useState(false)

  return (
    <div className="space-y-3">
      <SettingsRow
        label="Password"
        action={!changing && (
          <button type="button" onClick={() => { setChanging(true); setChanged(false) }} className="font-medium text-accent hover:text-accent-hover">
            Change
          </button>
        )}
      >
        Set
      </SettingsRow>
      {changed && (
        <p role="status" className="text-small text-success">
          Your password is changed. You stay signed in here; everywhere else — other browsers, your phone — is signed out.
        </p>
      )}
      {changing && (
        <div className="rounded-xl border border-border bg-surface-1 p-5">
          <ChangePasswordForm onDone={() => { setChanging(false); setChanged(true) }} />
          <button type="button" onClick={() => setChanging(false)} className="mt-3 text-small text-text-muted hover:text-text-secondary">
            Cancel
          </button>
        </div>
      )}
      <CloudAccountRow />
      <PledgeRow />
      <div className="pt-2">
        <Button variant="secondary" onClick={() => void logout()}>Sign out</Button>
      </div>
    </div>
  )
}
