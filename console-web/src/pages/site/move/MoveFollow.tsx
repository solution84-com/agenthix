import { Button, StatePill } from '@agenthix/ui/primitives'
import { Notice, PageHeading } from '../../../components'
import { navigate } from '../../../router'
import { Steps } from '../../add/JoinParts'
import { useJoin } from '../../add/useJoin'
import { whenIs } from '../../dashboard/words'
import { moveProgress } from './moveWords'
import { useMachineName, useMove } from './useMove'
import { WaitingForMachine, type Code } from './WaitingForMachine'

/** A site's move once started (board *Moving a site*, spec §13): the new machine's code, then the move's steps. */
export function MoveFollow({ moveId, fromName, code, pollMs }: { moveId: string; fromName: string | null; code: Code | null; pollMs?: number }) {
  const { move, busy, error, cancel, finish } = useMove(moveId, pollMs)
  const waiting = move?.state === 'waitingForMachine'
  const join = useJoin(waiting ? move.joinId : null, pollMs)
  const toName = useMachineName(move?.to ?? null, join.view?.machine?.name ?? null)
  if (!move) return (<><PageHeading title="Move site" />{error && <Notice tone="danger">{error}</Notice>}</>)

  const from = fromName ?? 'the old machine'
  if (waiting) return <WaitingForMachine move={move} code={code} join={join} cancel={cancel} busy={busy} error={error} />

  const p = moveProgress(move, { from, to: toName }, new Date())
  const who = move.by ? `${move.at ? 'Scheduled' : 'Started'} by ${move.by.name}` : `${move.at ? 'Scheduled' : 'Started'} on the machine by its machine admin`
  return (
    <>
      <PageHeading title={p.title} badges={p.stepOf ? <StatePill>{p.stepOf}</StatePill> : undefined}
        lede={`${who}${move.at ? ` for ${whenIs(move.at, new Date())}` : ''}.`} />
      <div className="flex max-w-2xl flex-col gap-3">
        {error && <Notice tone="danger">{error}</Notice>}
        {p.ended && <Notice tone={p.ended.tone} title={p.ended.title}>{p.ended.text}</Notice>}
        {p.problem && (
          <Notice tone="warning" action={p.canFinish ? <Button variant="secondary" disabled={busy} onClick={finish}>Finish the move</Button> : undefined}>{p.problem}</Notice>
        )}
        <Steps steps={p.steps} />
        {!p.ended && (
          <p className="text-small text-text-secondary">
            If {toName ?? 'the new machine'} does not take over, the site goes back to {from}, which still holds everything, and HQ says the move did not complete.
          </p>
        )}
        <div className="flex gap-2">
          {p.canCancel && <Button variant="secondary" disabled={busy} onClick={cancel}>Cancel the move</Button>}
          {p.ended && <Button variant="secondary" onClick={() => navigate('/')}>Back to the dashboard</Button>}
        </div>
      </div>
    </>
  )
}
