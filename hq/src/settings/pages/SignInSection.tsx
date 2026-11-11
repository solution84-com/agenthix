import { useState } from 'react'
import { logout } from 'wasp/client/auth'
import { Button, FOCUS_RING } from '@agenthix/ui/primitives'
import { ChangePasswordForm } from './ChangePasswordForm'
import { SettingsRow } from './SettingsSection'
import { CloudAccountRow } from './CloudAccountRow'
import { PledgeRow } from './PledgeRow'

/** Settings › Sign-in: changing the password, the linked Agenthix account and its pledge signature, and signing out of this browser. */
export function SignInSection() {
  const [changing, setChanging] = useState(false)

  return (
    <div className="space-y-3">
      <SettingsRow
        label="Password"
        action={!changing && (
          <button type="button" onClick={() => { setChanging(true) }} className={`rounded font-medium text-link hover:underline ${FOCUS_RING}`}>
            Change
          </button>
        )}
      >
        Set
      </SettingsRow>
      {changing && (
        <div className="rounded-xl border border-border bg-surface-1 p-5">
          <ChangePasswordForm onDone={() => { setChanging(false) }} />
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
