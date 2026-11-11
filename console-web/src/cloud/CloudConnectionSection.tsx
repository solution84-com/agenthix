import { useEffect } from 'react'
import type { CloudConnectEnded } from '@agenthix/core'
import { KeyValueRow } from '../components'
import { spanOf } from '../pages/dashboard/words'
import { useCloudRead } from './api'
import { cloudConnectionWords } from './CloudHqHero'
import { CloudMark } from './CloudMark'
import { AskedLine, ConnectedFacts, ProtocolProblem, RunByCloud, WhatCloudGives } from './CloudSectionStates'
import { useAskCount, type CloudSectionView } from './platform'
import { CLOUD } from './words'

/** How often the page asks again while a connection waits on approval on Cloud. */
export const CONNECTING_POLL_MS = 3000

/**
 * The organisation's connection to Cloud, on HQ's page (board *Connecting the organisation*). It is the
 * organisation's, held by HQ, and made and removed in HQ by an organisation admin: this section only reads it and says
 * where to do it. While a connection waits on approval in HQ, the page reads it again every few seconds.
 */
export function CloudConnection({ org }: { org: string | null }) {
  const view = useCloudRead<CloudSectionView>('/cloud')
  const asked = useAskCount()
  const waiting = view.phase === 'ready' && !!view.value.connecting
  const { reload } = view
  useEffect(() => {
    if (!waiting) return
    const timer = setInterval(reload, CONNECTING_POLL_MS)
    return () => clearInterval(timer)
  }, [waiting, reload])
  if (view.phase !== 'ready') return null
  return <CloudConnectionSection view={view.value} org={org} asked={asked} />
}

const ENDED: Record<CloudConnectEnded, { title: string; text: string }> = {
  refused: { title: 'Not approved', text: `The connection was refused on ${CLOUD}.` },
  expired: { title: 'The code expired', text: `It was not approved on ${CLOUD} in time.` },
  failed: { title: 'Not connected', text: `${CLOUD} stopped answering before the connection was approved.` },
}

function connectionWords(view: CloudSectionView): string {
  const words = cloudConnectionWords(view.organisation)
  if (!view.organisation || view.runByCloud) return words
  const since = spanOf(view.organisation.connectedAt, new Date())
  return since.startsWith('0 ') ? `${words} · just now` : `${words} · for ${since}`
}

/** Where the connection is made now: in HQ, by an organisation admin. */
export function ConnectInHq({ named }: { named: string }) {
  return (
    <p className="mt-2 text-small text-text-secondary">
      Connecting {named} to {CLOUD}, and disconnecting it, is done in HQ by an organisation admin, under Manage › Providers.
    </p>
  )
}

export function CloudConnectionSection({ view, org, asked = null }: { view: CloudSectionView; org: string | null; asked?: number | null }) {
  const named = org ?? 'the organisation'
  const connected = view.organisation !== null
  const connecting = view.connecting ?? null
  const ended = !connected && !connecting && view.lastAttempt ? ENDED[view.lastAttempt] : null
  return (
    <section aria-label={`${CLOUD} connection`} className="mb-4 max-w-3xl rounded-2xl border border-border px-4 py-3.5">
      <div className="mb-2"><CloudMark /></div>
      <KeyValueRow label="Connection">{connecting ? 'Waiting for approval in HQ' : connectionWords(view)}</KeyValueRow>
      {view.problem && <ProtocolProblem problem={view.problem} />}
      {connected && !connecting && (view.runByCloud
        ? <RunByCloud view={view} named={named} />
        : <ConnectedFacts view={view} named={named} />)}
      {!connected && !connecting && (view.runByCloud
        ? <p className="mt-1 text-small text-text-secondary">{CLOUD} connects HQ as it sets it up. If it has not, connect it in HQ.</p>
        : (
          <>
            <WhatCloudGives named={named} />
            <AskedLine count={asked} named={named} />
          </>
        ))}
      {ended && <p className="mt-2 text-small text-text-secondary"><b className="font-semibold text-text-primary">{ended.title}</b> {ended.text}</p>}
      {!view.runByCloud && <ConnectInHq named={named} />}
    </section>
  )
}
