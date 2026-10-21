import { useState } from 'react'
import { Button, COPY_FAILED_WORDS, copyText, StatePill } from '@agenthix/ui/primitives'
import { Notice, PageHeading } from '../../components'
import { navigate } from '../../router'
import { Steps } from '../add/JoinParts'
import { useJoin } from '../add/useJoin'
import type { FleetHost } from '../dashboard/types'
import { whenIs } from '../dashboard/words'
import { useMachineName, useMove } from '../site/move/useMove'
import { WaitingForMachine, type Code } from '../site/move/WaitingForMachine'
import { hqMoveProgress } from './hqMoveWords'
import { pointingCommands } from './hqWords'

/** HQ's move once started (board *Moving hq*, spec §13): the new machine's code, then the move's steps. */
export function MoveHqFollow({ moveId, fromName, hosts, code, consoleCame, pollMs }: {
  moveId: string
  fromName: string | null
  hosts: FleetHost[]
  code: Code | null
  consoleCame: string | null
  pollMs?: number
}) {
  const { move, busy, error, cancel, finish } = useMove(moveId, pollMs)
  const waiting = move?.state === 'waitingForMachine'
  const join = useJoin(waiting ? move.joinId : null, pollMs)
  const toName = useMachineName(move?.to ?? null, join.view?.machine?.name ?? null)
  if (!move) return (<><PageHeading title="Move HQ" />{error && <Notice tone="danger">{error}</Notice>}</>)
  if (waiting) return <WaitingForMachine move={move} code={code} join={join} cancel={cancel} busy={busy} error={error} />

  const from = fromName ?? 'the old machine'
  const newAddress = move.hqAddress ?? null
  const p = hqMoveProgress(move, { from, to: toName }, newAddress, consoleCame, new Date())
  const who = move.by ? `${move.at ? 'Scheduled' : 'Started'} by ${move.by.name}` : `${move.at ? 'Scheduled' : 'Started'} on the machine by its machine admin`
  const offline = hosts.filter(h => !h.hqMachine && h.fingerprint !== move.to && (!h.online || h.leftByItself))
  return (
    <>
      <PageHeading title={p.title} badges={p.stepOf ? <StatePill>{p.stepOf}</StatePill> : undefined}
        lede={`${who}${move.at ? ` for ${whenIs(move.at, new Date())}` : ''}.${newAddress ? ` To ${newAddress}.` : ' HQ keeps its own address.'}`} />
      <div className="flex max-w-2xl flex-col gap-3">
        {error && <Notice tone="danger">{error}</Notice>}
        {p.ended && <Notice tone={p.ended.tone} title={p.ended.title}>{p.ended.text}</Notice>}
        {p.problem && (
          <Notice tone="warning" action={p.canFinish ? <Button variant="secondary" disabled={busy} onClick={finish}>Finish the move</Button> : undefined}>{p.problem}</Notice>
        )}
        <Steps steps={p.steps} />
        {!p.ended && (
          <p className="text-small text-text-secondary">
            If {toName ?? 'the new machine'} does not take over, HQ goes back to {from}, which still holds everything, and the move reads as not completed.
          </p>
        )}
        {newAddress && offline.length > 0 && move.state !== 'cancelled' && move.state !== 'failed' && <LeftOver names={offline.map(h => h.siteName)} address={newAddress} />}
        <div className="flex gap-2">
          {p.canCancel && <Button variant="secondary" disabled={busy} onClick={cancel}>Cancel the move</Button>}
          {p.ended && <Button variant="secondary" onClick={() => navigate('/')}>Back to the dashboard</Button>}
        </div>
      </div>
    </>
  )
}

/** Machines offline while HQ moved to a new address: they never heard it, so they are pointed at it by hand. */
function LeftOver({ names, address }: { names: string[]; address: string }) {
  const [copy, setCopy] = useState<'idle' | 'copied' | 'failed'>('idle')
  const commands = pointingCommands(address)
  const list = names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
  return (
    <Notice tone="warning" title={`${list} ${names.length === 1 ? 'has' : 'have'} not heard the new address.`} action={
      <div className="flex items-center gap-2">
        <Button variant="secondary" onClick={() => { void copyText(commands.join('\n')).then(ok => setCopy(ok ? 'copied' : 'failed')) }}>Copy the commands</Button>
        {copy === 'copied' && <span className="text-small text-text-secondary">Copied.</span>}
        {copy === 'failed' && <span className="text-small text-text-secondary">{COPY_FAILED_WORDS}</span>}
      </div>
    }>
      <p>{names.length === 1 ? 'It was' : 'They were'} offline, so neither site nor host service was told. Run these on each:</p>
      <code className="my-1.5 block whitespace-pre rounded-lg bg-surface-2 px-3 py-2 font-mono text-small">{commands.join('\n')}</code>
      <p>The machine's own command comes first: until its host service has the new address, the Fleet Console cannot reach it.</p>
    </Notice>
  )
}
