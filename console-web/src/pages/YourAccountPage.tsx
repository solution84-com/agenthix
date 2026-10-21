/**
 * Your account (board *Your account*): who the person is in HQ and how they sign in here. The Fleet Console has no
 * accounts of its own: name and password belong to HQ. The authenticator code and the person's own Cloud sign-in are
 * in cloud/accountParts.tsx, which shows their not-connected state.
 */
import type { ReactNode } from 'react'
import { Button } from '@agenthix/ui/primitives'
import { useAuth, useSignedInUser } from '../auth/AuthContext'
import { useSessionDetails } from '../auth/useSessionDetails'
import { useAuthenticatorItem, useCloudAccountItems } from '../cloud/accountParts'
import { CloudMark } from '../cloud/CloudMark'
import { Card, HqLink, PageHeading } from '../components'

/** HQ's page where a person changes their own name and password. */
const HQ_SETTINGS = '/settings'

/** "12 Oct", with the year when it is not this year's. */
function dayOf(iso: string, now = new Date()): string {
  const d = new Date(iso)
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', ...(d.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' }) })
}

export function YourAccountPage() {
  const user = useSignedInUser()
  const { signOut } = useAuth()
  // HQ gives the username, the roles and the date; while it does not answer, the page does without them.
  const details = useSessionDetails()
  const account = details?.account ?? null
  const address = details?.hq?.address ?? null
  const code = useAuthenticatorItem(account?.username ?? null)
  const cloud = useCloudAccountItems()
  const change = address ? <HqLink address={address} path={HQ_SETTINGS}>Change in HQ ↗</HqLink> : undefined

  const roles = account?.organisationAdmin ? 'the fleet admin and organisation admin roles' : 'the fleet admin role'
  return (
    <div className="max-w-3xl">
      <PageHeading title="Your account" lede={cloud ? 'Your sign-in to this Fleet Console, and your own sign-in to Cloud.' : 'Your sign-in to this Fleet Console.'} />

      <Panel title="Your details">
        <Item fact={<b className="font-semibold">{user.name}</b>} action={change}>
          {account && <>Username <code className="font-mono text-[.92em]">{account.username}</code> · </>}
          An HQ account, with {roles}{account?.since ? ` since ${dayOf(account.since)}` : ''}. Your name is kept by HQ: change it there.
        </Item>
      </Panel>

      <Panel title="Signing in">
        <Item fact="Password" action={change}>Kept by HQ: you sign in here with your HQ login. Change it in HQ.</Item>
        {code && <Item fact={code.fact} action={code.action}>{code.text}</Item>}
      </Panel>

      {cloud && (
        <Panel title={<CloudMark />}>
          {cloud.map(i => <Item key={i.key} fact={i.fact} action={i.action}>{i.text}</Item>)}
        </Panel>
      )}

      <div className="mt-1.5 flex items-center gap-2.5 text-small text-text-muted">
        <Button variant="secondary" type="button" onClick={() => void signOut()}>Sign out</Button>
        of the Fleet Console on this browser.
      </div>
    </div>
  )
}

function Panel({ title, children }: { title: ReactNode; children: ReactNode }) {
  return (
    <Card className="mb-3">
      <h2 className="mb-1.5 text-micro font-semibold uppercase tracking-[.06em] text-text-muted">{title}</h2>
      {children}
    </Card>
  )
}

function Item({ fact, children, action }: { fact: ReactNode; children: ReactNode; action?: ReactNode }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 border-t border-border-subtle py-2.5 text-small text-text-primary first-of-type:border-t-0">
      <div>
        {fact}
        <small className="mt-0.5 block text-micro leading-[1.45] text-text-muted">{children}</small>
      </div>
      {action && <div className="flex flex-wrap justify-end gap-2">{action}</div>}
    </div>
  )
}
