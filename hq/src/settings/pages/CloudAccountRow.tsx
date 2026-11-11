import { useEffect, useState } from 'react'
import { Button, FIELD, FOCUS_RING } from '@agenthix/ui/primitives'
import {
  readOwnCloudLink, startCloudSignIn, unlinkOwnCloudAccount, type OwnCloudLink,
} from '../../auth/pages/parts/cloudSignInApi'
import { ShowAttention } from '@agenthix/ui/attention'
import { SettingsRow } from './SettingsSection'
import { CloudAskRow } from './CloudAskRow'

function words(link: OwnCloudLink): string {
  if (link.linked) return link.connected ? 'Linked · you can sign in with Agenthix Cloud' : 'Linked · signing in with it works once HQ is connected to Agenthix Cloud again'
  return 'Not linked'
}

const rowLink = `rounded font-medium text-link hover:underline ${FOCUS_RING}`
const INPUT = `w-full rounded-lg ${FIELD} px-3 py-2 text-body`

/**
 * Settings › Sign-in › Agenthix account: link it, so *Sign in with Agenthix Cloud* signs you in here, or unlink it.
 * Linking asks for your password first. Not connected, it says so; nothing calls Cloud.
 */
export function CloudAccountRow({ start = startCloudSignIn }: { start?: typeof startCloudSignIn }) {
  const [link, setLink] = useState<OwnCloudLink | null>(null)
  const [asking, setAsking] = useState(false)
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [unlinkFailed, setUnlinkFailed] = useState<string | null>(null)

  useEffect(() => { void readOwnCloudLink().then(setLink) }, [])

  async function linkIt(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    const refusal = await start('link', password)
    if (refusal) {
      setError(refusal)
      setBusy(false)
    }
  }

  async function unlink() {
    setBusy(true)
    setUnlinkFailed(null)
    if (await unlinkOwnCloudAccount()) setLink(l => (l ? { ...l, linked: null } : l))
    else setUnlinkFailed('Agenthix Cloud was not unlinked. Try again.')
    setBusy(false)
  }

  if (!link) return null
  if (!link.connected && !link.linked) return <CloudAskRow />
  const action = link.linked
    ? <button type="button" className={rowLink} disabled={busy} onClick={() => void unlink()}>Unlink</button>
    : link.connected && !asking && <button type="button" className={rowLink} onClick={() => setAsking(true)}>Link</button>

  return (
    <>
      <SettingsRow label="Agenthix account" action={action}>
        {words(link)}
      </SettingsRow>
      <ShowAttention kind="alert" text={unlinkFailed} title="The account was not unlinked" retry={() => void unlink()} onClose={() => setUnlinkFailed(null)} />
      {asking && !link.linked && (
        <form onSubmit={linkIt} className="rounded-xl border border-border bg-surface-1 p-5">
          <label htmlFor="cloud-link-password" className="mb-1.5 block text-small font-medium text-text-muted">Your password, to confirm it is you</label>
          <input id="cloud-link-password" type="password" autoComplete="current-password" className={INPUT} value={password} onChange={e => setPassword(e.target.value)} required />
          {error && <p role="status" className="mt-2 text-small text-danger">{error}</p>}
          <div className="mt-3 flex gap-2">
            <Button type="submit" disabled={busy || !password}>Continue to Agenthix Cloud</Button>
            <Button type="button" variant="secondary" onClick={() => { setAsking(false); setPassword(''); setError('') }}>Cancel</Button>
          </div>
        </form>
      )}
    </>
  )
}
