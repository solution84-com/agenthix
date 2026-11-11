/**
 * Remote access (board *Remote access*, spec §7): a tunnel turned on for a while, only at the Fleet Console's machine.
 * A session that came in through it sees the state, the time left and *Turn off* — never Turn on or Extend. It
 * needs the organisation connected to Cloud, since the relay is Cloud's. The server answers
 * every change "not connected" until Cloud's relay exists.
 */
import { useState } from 'react'
import { BRANDING, type RemoteAccessView } from '@agenthix/core'
import { Button, COPY_FAILED_WORDS, copyText, StatePill } from '@agenthix/ui/primitives'
import { useConsoleStatus } from '../../auth/useConsoleStatus'
import { useSessionDetails } from '../../auth/useSessionDetails'
import { useCloudAsk, useCloudRead } from '../../cloud/api'
import { CloudAskNotice } from '../../cloud/CloudMark'
import { CLOUD } from '../../cloud/words'
import { Card, KeyValueRow, Notice, PageHeading, Say } from '../../components'
import { Link } from '../../router'
import { useHqSite } from './useHqSite'
import { TurnOnModal } from './TurnOnModal'
import { clockOf, timeLeft } from './words'
import { HQ_PATH } from '../../shell/menu'

export function RemoteAccessPage() {
  const view = useCloudRead<RemoteAccessView>('/remote-access')
  const status = useConsoleStatus()
  const org = useSessionDetails()?.hq?.organisationName ?? null
  const hqSite = useHqSite()
  const machine = status.phase === 'ready' ? status.status.machineName : null
  return (
    <div className="max-w-3xl">
      <PageHeading title="Remote access" lede="Lets a fleet admin open this Fleet Console from anywhere, for a while." />
      {view.phase === 'failed' && <Notice kind="alert" title="Remote access could not be read" retry={view.reload}>{view.message}</Notice>}
      {view.phase === 'ready' && <RemoteAccess view={view.value} org={org} machine={machine} hqSite={hqSite} now={new Date()} />}
    </div>
  )
}

export function RemoteAccess({ view, org, machine, hqSite, now }: {
  view: RemoteAccessView
  org: string | null
  machine: string | null
  hqSite: { fingerprint: string; machineName: string } | null
  now: Date
}) {
  const [dialog, setDialog] = useState<'on' | 'extend' | null>(null)
  const off = useCloudAsk()
  const { state } = view
  const here = view.place === 'onTheMachine'
  const at = <b className="font-semibold text-text-primary">{machine ?? "the Fleet Console's machine"}</b>
  const named = org ?? 'the organisation'
  const cli = (words: string) => <code className="font-mono text-[.92em] text-text-primary">{BRANDING.cliCommand} {words}</code>

  if (state.on) {
    return (
      <Card>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <StatePill tone="healthy">On</StatePill>
          {!here && <StatePill>You are using it</StatePill>}
          <span className="text-small text-text-secondary">switches itself off at {clockOf(state.endsAt)}</span>
        </div>
        <KeyValueRow label="Time left">{timeLeft(state.endsAt, now)}</KeyValueRow>
        <KeyValueRow label="Turned on">
          {clockOf(state.startedAt)} {state.turnedOnBy.via === 'cli' ? <>by {at}'s machine admin, at the command line</> : <>on {at}'s screen</>}
        </KeyValueRow>
        <KeyValueRow label="Address"><Address address={state.address} /></KeyValueRow>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="danger" disabled={off.ask.phase === 'working'} onClick={() => void off.send('DELETE', '/remote-access')}>Turn off now</Button>
          {here && <Button variant="secondary" onClick={() => setDialog('extend')}>Extend…</Button>}
        </div>
        {!here && (
          <p className="mt-3 text-small text-text-secondary">
            Turning it off ends every remote session, yours included. To keep it on longer, go back to {at}, the Fleet Console's
            machine: remote access can be turned on or extended only there.
          </p>
        )}
        <div className="mt-3"><CloudAskNotice ask={off.ask} /></div>
        <TurnOnModal open={dialog !== null} extend org={org} onClose={() => setDialog(null)} />
      </Card>
    )
  }

  return (
    <Card>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <StatePill>Off</StatePill>
        <span className="text-small text-text-secondary">{view.organisationConnected ? 'Off — the usual state' : 'Cannot be turned on yet'}</span>
      </div>
      {view.organisationConnected ? (
        <>
          <p className="text-small text-text-secondary">
            While it is on, the Fleet Console dials out to Cloud's relay and is reachable at an address under Cloud's domain. Your
            connection stays encrypted all the way to the Fleet Console; Cloud passes on what it cannot read. Every session is
            announced to every fleet admin and organisation admin, and it switches itself off when the time is up.
          </p>
          <div className="mt-3">
            <Say lead="Cloud can never turn this on.">
              Only someone at {at}, the Fleet Console's machine, can: here, on this machine or through an SSH tunnel, or with {cli('console remote on')}.
            </Say>
          </div>
        </>
      ) : (
        <Say lead={`Needs ${named} connected to ${CLOUD}.`}>
          {hqSite && <><Link to={HQ_PATH} className="font-semibold text-text-primary hover:underline">Open HQ's page ↗</Link>{' '}</>}
          The relay is Cloud's. Connecting is done on the Fleet Console's machine, from HQ's page — not here.
        </Say>
      )}
      {here && (
        <div className="mt-3 flex flex-wrap items-center gap-2.5">
          <Button disabled={!view.organisationConnected} onClick={() => setDialog('on')}>Turn on remote access…</Button>
          {!view.organisationConnected && <span className="text-small text-text-muted">Connect {named} to {CLOUD} first.</span>}
        </div>
      )}
      <TurnOnModal open={dialog === 'on'} org={org} onClose={() => setDialog(null)} />
    </Card>
  )
}

function Address({ address }: { address: string }) {
  const [copy, setCopy] = useState<'idle' | 'copied' | 'failed'>('idle')
  return (
    <span className="flex flex-wrap items-center gap-2">
      <code className="font-mono text-[.92em]">{address}</code>
      <Button variant="secondary" size="sm" onClick={() => void copyText(address).then(ok => setCopy(ok ? 'copied' : 'failed'))}>
        {copy === 'copied' ? 'Copied' : 'Copy'}
      </Button>
      {copy === 'failed' && <span className="text-micro text-text-muted">{COPY_FAILED_WORDS}</span>}
    </span>
  )
}
