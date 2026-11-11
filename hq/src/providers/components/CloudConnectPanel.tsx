import { useEffect, useState } from 'react'
import { useAction, useQuery, getHqCloudConnection, connectHqToCloud, disconnectHqFromCloud } from 'wasp/client/operations'
import type { CloudConnectEnded } from '@agenthix/core'
import { Button, ConfirmDialog, FOCUS_RING } from '@agenthix/ui/primitives'
import { ShowAttention, useBackgroundRead } from '@agenthix/ui/attention'

const POLL_MS = 3000

const ENDED: Record<CloudConnectEnded, string> = {
  refused: 'The connection was refused on Agenthix Cloud. Connect again to ask once more.',
  expired: 'The code was not approved on Agenthix Cloud in time. Connect again for a new code.',
  failed: 'Agenthix Cloud stopped answering before the connection was approved. Try again in a moment.',
}

export const CLOUD_NOT_AVAILABLE_WORDS = "Agenthix Cloud's models and voice aren't available yet."

export interface CloudConnectPanelProps {
  /** Called once when the connection is seen to be made (not when it was already there). */
  onConnected?: () => void
  /** Offer *Disconnect* when connected: on Providers, not in setup. */
  allowDisconnect?: boolean
}

/**
 * Connecting HQ to Agenthix Cloud with the device approval: a short code, approved on Cloud's page, which this panel
 * waits on. Organisation admins only; the server refuses anyone else. Used by setup and by Providers.
 */
export function CloudConnectPanel({ onConnected, allowDisconnect }: CloudConnectPanelProps) {
  const query = useQuery(getHqCloudConnection, undefined, { refetchInterval: POLL_MS })
  const { data: state, refetch } = query
  const read = useBackgroundRead(query, { what: 'The Cloud connection', pollMs: POLL_MS })
  const connect = useAction(connectHqToCloud)
  const disconnect = useAction(disconnectHqFromCloud)
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [sawNotConnected, setSawNotConnected] = useState(false)
  const connected = !!state?.connection

  useEffect(() => {
    if (!state) return
    if (!state.connection) setSawNotConnected(true)
    else if (sawNotConnected) { setSawNotConnected(false); onConnected?.() }
  }, [state, sawNotConnected, onConnected])

  const run = async (work: () => Promise<unknown>) => {
    setBusy(true)
    setProblem('')
    try {
      await work()
      await refetch()
    } catch (err) {
      setProblem(err instanceof Error ? err.message : 'Could not do that. Try again.')
    } finally {
      setBusy(false)
    }
  }

  if (!state) return read.failedWithoutData ? <>{read.nudge}</> : <p className="text-small text-text-muted">Loading…</p>

  const connecting = state.connecting
  return (
    <div className="space-y-3" aria-label="Agenthix Cloud connection">
      {read.nudge}
      <ShowAttention kind="nudge" place="meta" text={state.problem} />
      {connected && state.connection && (
        <div>
          <p className="text-body font-medium text-text-primary">Agenthix Cloud is connected</p>
          <p className="text-small text-text-secondary">Connected as {state.connection.name}. Every organisation admin is told, and the change is recorded.</p>
          {!state.aiAvailable && <p className="mt-1 text-small text-text-muted">{CLOUD_NOT_AVAILABLE_WORDS}</p>}
          {allowDisconnect && !state.runByCloud && !confirming && (
            <Button className="mt-2" variant="ghost" onClick={() => setConfirming(true)}>Disconnect…</Button>
          )}
          <ConfirmDialog
            open={confirming}
            title="Disconnect Agenthix Cloud?"
            description="Disconnecting stops sign-in with Agenthix accounts and leaves Agenthix Cloud as a provider that is not connected. Every organisation admin is told."
            confirmLabel="Disconnect Agenthix Cloud"
            destructive
            busy={busy}
            onConfirm={() => void run(async () => { await disconnect(undefined); setConfirming(false) })}
            onCancel={() => setConfirming(false)}
          />
        </div>
      )}
      {!connected && connecting && (
        <div>
          <p className="text-small text-text-secondary">Open Agenthix Cloud and check that it shows this code, then approve the connection with your Agenthix account.</p>
          <p aria-label="Code to check" className="my-2 font-mono text-h1 font-medium tracking-[.18em] text-text-primary">{connecting.userCode}</p>
          <a href={connecting.verificationUriComplete} target="_blank" rel="noopener noreferrer" className={`rounded text-small font-medium text-link hover:underline ${FOCUS_RING}`}>Approve on Agenthix Cloud ↗</a>
          <p className="mt-2 text-small text-text-secondary">Waiting for approval… This page updates by itself.</p>
        </div>
      )}
      {!connected && !connecting && (
        <div>
          {state.lastAttempt && <p className="mb-2 text-small text-text-secondary">{ENDED[state.lastAttempt]}</p>}
          <Button disabled={busy} onClick={() => void run(() => connect(undefined))}>Connect Agenthix Cloud</Button>
          <p className="mt-1 text-small text-text-muted">You approve it with a short code at Agenthix Cloud. Every organisation admin is told, and the change is recorded.</p>
        </div>
      )}
      <ShowAttention kind="alert" text={problem} title="Agenthix Cloud was not changed" onClose={() => setProblem('')} />
    </div>
  )
}
