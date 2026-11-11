import type { ReactNode } from 'react'
import { AUTHENTICATOR_RECOVERY_CODE_COUNT, BRANDING, type AuthenticatorView, type CloudView } from '@agenthix/core'
import { isFinal, Nudge } from '@agenthix/ui/attention'
import { Button } from '@agenthix/ui/primitives'
import { navigate } from '../router'
import { useCloudAsk, useCloudRead, type CloudRead } from './api'
import { CloudAskNotice } from './CloudMark'
import { useCloudStale } from './useCloudStale'

/** One line of *Your account*: what it is, what it says, and what can be done. */
export type AccountItem = { key: string; fact: ReactNode; text: ReactNode; action?: ReactNode }

const cli = (args: string) => <code className="font-mono text-[.92em] text-text-primary">{`${BRANDING.cliCommand} ${args}`}</code>

function dayOf(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

/**
 * The authenticator code on *Your account* (board *Your account*): asked for only through remote access, set up on
 * the Fleet Console's machine, and reset there.
 */
export function authenticatorItem(view: AuthenticatorView, username: string | null): AccountItem {
  const reset = cli(`console reset-code ${username ?? '<username>'}`)
  const remote = view.place === 'throughRemoteAccess'
  if (!view.code) {
    return {
      key: 'code',
      fact: 'Authenticator code',
      text: remote
        ? 'Not set up. Set up your authenticator code on the Fleet Console\'s machine, or through an SSH tunnel to it.'
        : 'Not set up. It is asked for only when you sign in through remote access; here, your HQ login is enough.',
      action: remote ? undefined : <Button variant="secondary" size="sm" onClick={() => navigate('/account/code')}>Set up…</Button>,
    }
  }
  const left = <><b className="font-semibold text-text-primary">{view.code.recoveryCodesLeft} of {AUTHENTICATOR_RECOVERY_CODE_COUNT}</b> recovery codes left.</>
  return {
    key: 'code',
    fact: 'Authenticator code',
    text: remote
      ? <>Set up {dayOf(view.code.setUpAt)}. You gave it to sign in here. Reset it on the Fleet Console's machine with {reset}. {left}</>
      : <>Set up {dayOf(view.code.setUpAt)} on this machine. Asked for only when you sign in through remote access, so a lost phone stops remote sign-in and nothing else. {left} To reset it: {reset}, run on this machine.</>,
  }
}

/** A read of this page that failed after its retries, said in the line it would have filled. */
function unreadItem(key: string, fact: ReactNode, what: string, read: Extract<CloudRead<unknown>, { phase: 'failed' }>, reload: () => void): AccountItem {
  const text = isFinal(read.error)
    ? <Nudge place="row">{read.message}</Nudge>
    : <Nudge place="row" action={{ label: 'Try again', onClick: reload }}>{what} could not be read.</Nudge>
  return { key, fact, text }
}

export function useAuthenticatorItem(username: string | null): AccountItem | null {
  const view = useCloudRead<AuthenticatorView>('/authenticator')
  if (view.phase === 'failed') return unreadItem('code', 'Authenticator code', 'The authenticator code', view, view.reload)
  return view.phase === 'ready' ? authenticatorItem(view.value, username) : null
}

/** The person's own Cloud sign-in: separate from the organisation's connection, which is on HQ's site page. */
export function cloudItems(view: CloudView, reload?: () => void): AccountItem[] {
  // Nothing is offered before Cloud can deliver it: linking shows nothing until the organisation is connected.
  if (!view.organisation) return []
  if (!view.account) {
    return [{
      key: 'cloud',
      fact: 'Not linked',
      text: 'Link the Cloud account you use, to see the sites Cloud runs for the organisation. Only the account\'s identifier is kept here.',
      action: <CloudButton method="POST" path="/cloud/account/sign-in" label="Link a Cloud account ↗" reload={reload} />,
    }]
  }
  return [
    {
      key: 'cloud',
      fact: <code className="font-mono text-[.92em]">{view.account.accountId}</code>,
      text: 'Signed in to Cloud. Cloud\'s sites show on the dashboard.',
      action: <CloudButton method="DELETE" path="/cloud/account/sign-in" label="Sign out of Cloud" reload={reload} />,
    },
    {
      key: 'forget',
      fact: 'Forget this Cloud account',
      text: 'You sign in to Cloud again to see its sites. Remote access is not affected: it uses the organisation\'s connection to Cloud, on HQ\'s site page.',
      action: <CloudButton method="DELETE" path="/cloud/account" label="Forget" reload={reload} />,
    },
  ]
}

/** On success the account list is read again, which shows the result (no message). */
function CloudButton({ method, path, label, reload }: { method: 'POST' | 'DELETE'; path: string; label: string; reload?: () => void }) {
  const { ask, send } = useCloudAsk()
  return (
    <div className="flex flex-col items-end gap-1.5">
      <Button variant="secondary" size="sm" disabled={ask.phase === 'working'} onClick={() => void send(method, path).then(answer => { if (answer !== null) reload?.() })}>{label}</Button>
      <CloudAskNotice ask={ask} />
    </div>
  )
}

export function useCloudAccountItems(): AccountItem[] | null {
  const view = useCloudRead<CloudView>('/cloud')
  const stale = useCloudStale(view, 'Your Cloud account')
  if (view.phase === 'failed') return [unreadItem('cloud', 'Cloud account', 'Your Cloud account', view, view.reload)]
  if (view.phase !== 'ready') return null
  const items = cloudItems(view.value, view.reload)
  return stale ? [{ key: 'stale', fact: stale, text: '' }, ...items] : items
}
