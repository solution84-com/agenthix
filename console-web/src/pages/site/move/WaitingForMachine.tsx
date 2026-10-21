import { Button } from '@agenthix/ui/primitives'
import { Notice, PageHeading } from '../../../components'
import { useSessionDetails } from '../../../auth/useSessionDetails'
import { codeLifetime, connectCommand, timeLeft } from '../../add/joinWords'
import { CodePanel, MachineCheck, WaitingRow } from '../../add/JoinParts'
import type { useJoin } from '../../add/useJoin'
import { whenIs } from '../../dashboard/words'
import type { Move } from './moveWords'

export type Code = { code: string; expiresAt: string; givenAt: Date }

/** A move waiting for its new machine: the code, then the machine to confirm. HQ's move is worded for HQ. */
export function WaitingForMachine({ move, code, join, cancel, busy, error }: {
  move: Move
  code: Code | null
  join: ReturnType<typeof useJoin>
  cancel: () => void
  busy: boolean
  error: string | null
}) {
  const address = useSessionDetails()?.hq?.address ?? null
  const what = move.kind === 'hq' ? 'HQ' : move.siteName
  const receives = move.kind === 'hq' ? 'HQ and its site' : move.siteName
  const p = join.phase ?? (code ? { phase: 'waiting' as const, left: timeLeft(code.expiresAt, new Date()) } : null)
  return (
    <>
      <PageHeading title={`Move ${what} to a new machine`}
        lede={move.at ? `Scheduled for ${whenIs(move.at, new Date())}, once the new machine is confirmed.` : 'It moves as soon as the new machine is confirmed.'} />
      <div className="flex max-w-2xl flex-col gap-3">
        {(error ?? join.error) && <Notice tone="danger">{error ?? join.error}</Notice>}
        {p?.phase === 'arrived' && (
          <>
            <p className="text-body text-text-primary">A machine used the code. Check it is the one you meant: it receives {receives} and starts no site of its own.</p>
            <MachineCheck machine={p.machine} warnings={p.warnings} confirmLabel={`Confirm ${p.machine.name}`} busy={join.busy} onConfirm={join.confirm} onRefuse={join.refuse} />
          </>
        )}
        {(p?.phase === 'working' || p?.phase === 'done') && <Notice>Confirmed. Setting the two machines up for the move…</Notice>}
        {p?.phase === 'failed' && <Notice tone="danger">{p.problem}</Notice>}
        {p?.phase === 'expired' && (
          <Notice tone="warning" title="The code ran out">No machine used it, so the move ends and {what} stays where it is. Start the move again for a new code.</Notice>
        )}
        {p?.phase === 'refused' && (
          <Notice title="Refused">The machine was turned away, so the move ends and {what} stays where it is. Start the move again for a new code.</Notice>
        )}
        {(!p || p.phase === 'waiting') && (
          <>
            {code
              ? <CodePanel code={code.code} lifetime={codeLifetime(code.expiresAt, code.givenAt)} command={connectCommand(address, code.code)} />
              : <Notice>The new machine's code was shown once, when this move was started. If it is lost, cancel this move and start it again.</Notice>}
            <WaitingRow left={p?.phase === 'waiting' ? p.left : ''} />
          </>
        )}
        {p?.phase !== 'expired' && p?.phase !== 'refused' && <div><Button variant="secondary" disabled={busy} onClick={cancel}>Cancel the move</Button></div>}
      </div>
    </>
  )
}
