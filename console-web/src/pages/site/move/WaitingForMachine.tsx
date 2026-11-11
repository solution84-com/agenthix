import type { ReactNode } from 'react'
import { Button, EmptyState } from '@agenthix/ui/primitives'
import { Notice, PageHeading, Problem } from '../../../components'
import { useSessionDetails } from '../../../auth/useSessionDetails'
import { codeLifetime, connectCommand, timeLeft } from '../../add/joinWords'
import { CodePanel, MachineCheck, WaitingRow } from '../../add/JoinParts'
import type { useJoin } from '../../add/useJoin'
import { whenIs } from '../../dashboard/words'
import type { Move } from './moveWords'

export type Code = { code: string; expiresAt: string; givenAt: Date }

/** A move waiting for its new machine: the code, then the machine to confirm. HQ's move is worded for HQ. */
export function WaitingForMachine({ move, code, join, cancel, busy, error, nudge }: {
  move: Move
  code: Code | null
  join: ReturnType<typeof useJoin>
  cancel: () => void
  busy: boolean
  error: string | null
  /** The move's poll could not be read (quiet, for the meta line). */
  nudge?: ReactNode
}) {
  const address = useSessionDetails()?.hq?.address ?? null
  const what = move.kind === 'hq' ? 'HQ' : move.siteName
  const receives = move.kind === 'hq' ? 'HQ and its site' : move.siteName
  const p = join.phase ?? (code ? { phase: 'waiting' as const, left: timeLeft(code.expiresAt, new Date()) } : null)
  return (
    <>
      <PageHeading title={`Move ${what} to a new machine`}
        lede={move.at ? `Scheduled for ${whenIs(move.at, new Date())}, once the new machine is confirmed.` : 'It moves as soon as the new machine is confirmed.'} meta={nudge ?? join.nudge} />
      <div className="flex max-w-2xl flex-col gap-3">
        {(error ?? join.error) && <Notice kind="alert">{error ?? join.error}</Notice>}
        {p?.phase === 'arrived' && (
          <>
            <p className="text-body text-text-primary">A machine used the code. Check it is the one you meant: it receives {receives} and starts no site of its own.</p>
            <MachineCheck machine={p.machine} warnings={p.warnings} confirmLabel={`Confirm ${p.machine.name}`} busy={join.busy} onConfirm={join.confirm} onRefuse={join.refuse} />
          </>
        )}
        {p?.phase === 'failed' && <Problem>{p.problem}</Problem>}
        {p?.phase === 'expired' && (
          <EmptyState variant="inline" title="The code ran out" hint={`No machine used it, so the move ends and ${what} stays where it is. Start the move again for a new code.`} />
        )}
        {p?.phase === 'refused' && (
          <EmptyState variant="inline" title="Refused" hint={`The machine was turned away, so the move ends and ${what} stays where it is. Start the move again for a new code.`} />
        )}
        {(!p || p.phase === 'waiting') && (
          <>
            {code
              ? <CodePanel code={code.code} lifetime={codeLifetime(code.expiresAt, code.givenAt)} command={connectCommand(address, code.code)} />
              : <EmptyState variant="inline" title="The new machine's code was shown once, when this move was started." hint="If it is lost, cancel this move and start it again." />}
            <WaitingRow left={p?.phase === 'waiting' ? p.left : ''} />
          </>
        )}
        {p?.phase !== 'expired' && p?.phase !== 'refused' && <div><Button variant="secondary" disabled={busy} onClick={cancel}>Cancel the move</Button></div>}
      </div>
    </>
  )
}
