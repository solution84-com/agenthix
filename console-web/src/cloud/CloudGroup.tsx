import type { CloudSiteSummary, CloudView } from '@agenthix/core'
import { Button } from '@agenthix/ui/primitives'
import { Notice } from '../components'
import { Link } from '../router'
import { useCloudAsk, type CloudRead } from './api'
import { CloudAskNotice, CloudMark } from './CloudMark'
import { CloudSiteCard } from './CloudSiteCard'
import { CLOUD } from './words'
import { HQ_PATH } from '../shell/menu'

/**
 * The fleet's Agenthix Cloud group (board *Cloud in the Fleet Console*). Its first states are the organisation's:
 * not connected, or connected; then whether this person's own Cloud sign-in shows Cloud's sites.
 */
export type CloudGroupState =
  | { kind: 'notConnected' }
  | { kind: 'signInNeeded' }
  | { kind: 'noRole' }
  | { kind: 'sites'; sites: CloudSiteSummary[] }
  | { kind: 'unreadable'; message: string }

export function cloudGroupState(view: CloudView, sites: CloudRead<{ sites: CloudSiteSummary[] }>): CloudGroupState | null {
  if (!view.organisation) return { kind: 'notConnected' }
  if (!view.account) return { kind: 'signInNeeded' }
  if (sites.phase === 'ready') return { kind: 'sites', sites: sites.value.sites }
  if (sites.phase === 'failed') return sites.code === 'no_cloud_role' ? { kind: 'noRole' } : { kind: 'unreadable', message: sites.message }
  return null
}

export function CloudGroup({ state, org, hqSite, now }: {
  state: CloudGroupState
  org: string | null
  /** HQ's site, whose page is where the organisation is connected. */
  hqSite: { fingerprint: string; machineName: string } | null
  now: Date
}) {
  const signIn = useCloudAsk()
  const named = org ?? 'the organisation'
  // HQ on Cloud is the hero; its machine is not repeated here.
  const sites = state.kind === 'sites' ? state.sites.filter(s => !s.hostsHq) : []
  const line = 'flex flex-wrap items-center gap-x-3 gap-y-1 rounded-[14px] border border-border bg-card px-4 py-3 text-small text-text-secondary'
  const signInButton = (words: string) => (
    <Button variant="secondary" size="sm" disabled={signIn.ask.phase === 'working'} onClick={() => void signIn.send('POST', '/cloud/account/sign-in')}>
      {words}
    </Button>
  )
  return (
    <section aria-label={CLOUD} className="mb-2">
      <div className="mt-6 mb-2.5"><CloudMark count={state.kind === 'sites' && sites.length > 0 ? sites.length : undefined} /></div>
      {state.kind === 'notConnected' && (
        <div className={line}>
          {hqSite ? (
            <Link to={HQ_PATH} className="font-semibold text-text-primary hover:underline">{named} is not connected to {CLOUD}</Link>
          ) : <b className="font-semibold text-text-primary">Not connected to {CLOUD}.</b>}
          <span>An organisation admin connects it in HQ, under Manage › Providers.</span>
        </div>
      )}
      {state.kind === 'signInNeeded' && <div className={line}>{signInButton('Sign in to Cloud to see the sites Cloud runs for you ↗')}</div>}
      {state.kind === 'noRole' && (
        <div className={line}>
          <span>
            <b className="font-semibold text-text-primary">Your Cloud account has no role for {named}</b>{' '}
            So no Cloud sites are shown. A Cloud owner of {named} can give you one in Cloud. Everything on your own machines works as before.
          </span>
          {signInButton('Sign in as someone else ↗')}
        </div>
      )}
      {state.kind === 'sites' && sites.length === 0 && <div className={line}>Connected. Cloud runs no sites for you yet.</div>}
      {sites.length > 0 && (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-3">
          {sites.map(s => <CloudSiteCard key={s.siteName} site={s} now={now} />)}
        </div>
      )}
      {state.kind === 'unreadable' && <Notice title="Cloud's sites could not be read">{state.message}</Notice>}
      <div className="mt-2"><CloudAskNotice ask={signIn.ask} /></div>
    </section>
  )
}
