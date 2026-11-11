import { useState } from 'react'
import { useQuery, getMyCloudSignIn, askForCloudSignIn } from 'wasp/client/operations'
import { FOCUS_RING } from '@agenthix/ui/primitives'
import { SettingsRow } from './SettingsSection'
import { ShowAttention } from '@agenthix/ui/attention'

export const NOT_CONNECTED_WORDS =
  'Not available here. HQ is not connected to Agenthix Cloud. With it, one Agenthix account signs you in to every organisation you belong to, and you switch between them at the top of the menu. Fleet admins turn it on.'
export const ASKED_WORDS =
  'You asked. Your fleet admins see how many people asked, in the Fleet Console. Once HQ is connected, you can link your account here.'

/**
 * Settings › Sign-in › Agenthix account while HQ is not connected: what the account would give, and a way to ask a
 * fleet admin to turn it on — once per person, for good. After asking there is no button.
 */
export function CloudAskRow() {
  const { data, refetch } = useQuery(getMyCloudSignIn)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)

  async function ask() {
    setBusy(true)
    setFailed(false)
    try {
      await askForCloudSignIn()
      await refetch()
    } catch {
      setFailed(true)
    }
    setBusy(false)
  }

  const action = data && !data.asked && (
    <button type="button" className={`rounded font-medium text-link not-disabled:hover:underline ${FOCUS_RING}`} disabled={busy} onClick={() => void ask()}>
      Ask a fleet admin to turn it on
    </button>
  )
  return (
    <SettingsRow label="Agenthix account" action={action}>
      {data?.asked ? ASKED_WORDS : NOT_CONNECTED_WORDS}
      <ShowAttention kind="alert" text={failed ? 'Could not send that. Try again.' : null} title="Your request was not sent" onClose={() => setFailed(false)} />
    </SettingsRow>
  )
}
