import { useEffect, useState } from 'react'
import type { CloudConnectEnded, CloudConnecting } from '@agenthix/core'
import { Button } from '@agenthix/ui/primitives'
import { ConfirmModal, HqLink, KeyValueRow, Notice, Say } from '../components'
import { spanOf } from '../pages/dashboard/words'
import { useCloudAsk, useCloudRead } from './api'
import { cloudConnectionWords } from './CloudHqHero'
import { CloudAskNotice, CloudMark } from './CloudMark'
import { AskedLine, CONNECT_HINT, ConnectedFacts, ProtocolProblem, ReadOnly, RunByCloud, WhatCloudGives } from './CloudSectionStates'
import { useAskCount, type CloudSectionView } from './platform'
import { CLOUD } from './words'

/** How often the page asks again while a connection waits on approval on Cloud. */
export const CONNECTING_POLL_MS = 3000

/**
 * The organisation's connection to Cloud, on HQ's page (board *Connecting the organisation*). It is the
 * organisation's, held by HQ, and made or removed only on the Fleet Console's machine: through remote access the
 * section is read-only and says so. While a connection waits on approval, the page reads it again every few seconds.
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
  return <CloudConnectionSection view={view.value} org={org} asked={asked} onChange={reload} />
}

const ENDED: Record<CloudConnectEnded, { title: string; text: string }> = {
  refused: { title: 'Not approved', text: `The connection was refused on ${CLOUD}. Connect again to ask once more.` },
  expired: { title: 'The code expired', text: `It was not approved on ${CLOUD} in time. Connect again for a new code.` },
  failed: { title: 'Not connected', text: `${CLOUD} stopped answering before the connection was approved. Try again in a moment.` },
}

function connectionWords(view: CloudSectionView): string {
  const words = cloudConnectionWords(view.organisation)
  if (!view.organisation || view.runByCloud) return words
  const since = spanOf(view.organisation.connectedAt, new Date())
  return since.startsWith('0 ') ? `${words} · just now` : `${words} · for ${since}`
}

/** What the admin checks on Cloud's page, and the link to it (board *Connecting the organisation*, *Waiting*). */
function Waiting({ connecting, remote, busy, onCancel }: { connecting: CloudConnecting; remote: boolean; busy: boolean; onCancel: () => void }) {
  return (
    <div className="mt-2">
      <p className="text-small text-text-secondary">Approve the connection on {CLOUD}, and check that it shows this code:</p>
      <p aria-label="Code to check" className="my-2 font-mono text-[1.4rem] font-semibold tracking-[.18em] text-text-primary">{connecting.userCode}</p>
      {!remote && (
        <div className="flex flex-wrap items-center gap-2">
          <HqLink address={connecting.verificationUriComplete}>Approve on {CLOUD} ↗</HqLink>
          <Button variant="ghost" disabled={busy} onClick={onCancel}>Cancel</Button>
        </div>
      )}
      <p className="mt-2 text-small text-text-secondary">Waiting for approval…</p>
    </div>
  )
}

export function CloudConnectionSection({ view, org, asked = null, initialDialog = false, onChange }: {
  view: CloudSectionView; org: string | null; asked?: number | null; initialDialog?: boolean; onChange?: () => void
}) {
  const action = useCloudAsk()
  const [confirming, setConfirming] = useState(initialDialog)
  const named = org ?? 'the organisation'
  const remote = view.place === 'throughRemoteAccess'
  const connected = view.organisation !== null
  const connecting = view.connecting ?? null
  const ended = !connected && !connecting && view.lastAttempt ? ENDED[view.lastAttempt] : null
  const send = async (method: 'POST' | 'DELETE') => {
    const answer = await action.send(method, '/cloud/organisation')
    if (answer !== null) onChange?.()
    return answer
  }
  return (
    <section aria-label={`${CLOUD} connection`} className="mb-4 max-w-3xl rounded-2xl border border-border px-4 py-3.5">
      <div className="mb-2"><CloudMark /></div>
      <KeyValueRow label="Connection">{connecting ? 'Waiting for approval' : connectionWords(view)}</KeyValueRow>
      {view.problem && <ProtocolProblem problem={view.problem} />}
      {connecting && <Waiting connecting={connecting} remote={remote} busy={action.ask.phase === 'working'} onCancel={() => void send('DELETE')} />}
      {connected && !connecting && (view.runByCloud
        ? <RunByCloud view={view} named={named} />
        : <ConnectedFacts view={view} named={named} />)}
      {/* A fourth state, waiting for an early-access place, would go here; whether connecting needs one is not decided. */}
      {!connected && !connecting && (view.runByCloud
        ? <p className="mt-1 text-small text-text-secondary">{CLOUD} connects HQ as it sets it up. If it has not, connect it here.</p>
        : (
          <>
            <WhatCloudGives named={named} />
            <AskedLine count={asked} named={named} />
          </>
        ))}
      {remote ? (
        <ReadOnly />
      ) : connected ? (
        !view.runByCloud && <Button variant="danger" className="mt-2" onClick={() => { action.reset(); setConfirming(true) }}>Disconnect…</Button>
      ) : connecting ? null : (
        <>
          {ended && <div className="mt-2"><Notice tone="warning" title={ended.title}>{ended.text}</Notice></div>}
          <Button className="mt-2" disabled={action.ask.phase === 'working'} onClick={() => void send('POST')}>
            Connect to {CLOUD} ↗
          </Button>
          <p className="mt-1 text-micro text-text-muted">{CONNECT_HINT}</p>
        </>
      )}
      <div className="mt-2"><CloudAskNotice ask={confirming ? { phase: 'idle' } : action.ask} /></div>
      <ConfirmModal
        open={confirming}
        title={`Disconnect ${named} from ${CLOUD}?`}
        confirmLabel="Disconnect"
        destructive
        busy={action.ask.phase === 'working'}
        onCancel={() => setConfirming(false)}
        onConfirm={() => void send('DELETE').then(() => setConfirming(false))}
      >
        <p>Nothing on your own machines changes:</p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-text-secondary">
          <li>Remote access to this Fleet Console is turned off, and cannot be turned on again until you connect.</li>
          <li>The sites Cloud runs for you leave this fleet.</li>
        </ul>
      </ConfirmModal>
    </section>
  )
}
