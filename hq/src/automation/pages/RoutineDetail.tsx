import { useState } from 'react'
import { Link } from 'react-router'
import {
  useAction, pauseRoutine, resumeRoutine, deleteRoutine, unlinkRoutineRound, runRoutineNow, skipRoutineRound,
} from 'wasp/client/operations'
import {
  OverflowMenu, RoutineEditLink, RoutineFacts, RoutineNextRound, RoutineRoundList, RoutineSectionHead, RoutineSentence,
  RoutineSquares, ruleSentence, type ScheduleRuleInput,
} from '@agenthix/ui/tasks'
import { AutomationSwitch } from '@agenthix/ui/projects'
import { PanelHeaderContent, ViewHeaderRow } from '@agenthix/ui/primitives'
import { useMayWork } from '../../shared/hooks/useMayWork'
import type { RoutineDetail as RoutineDetailData } from '../../shared/routineTypes'
import { RoutineEdit } from './RoutineEdit'
import { RoutineOnBehalfOf } from './RoutineOnBehalfOf'
import { useRoutineAct } from './useRoutineAct'

const PRIORITY: Record<string, string> = { LOW: 'Low', MEDIUM: 'Medium', HIGH: 'High' }

/**
 * One routine, inside the Automation tool (every screen reviewed spec §3): a sentence that says what happens; the
 * next round with Run now, Open and Skip this time; its last rounds as squares and as a list; what it creates and
 * when, each edited in place; who it is on behalf of. Its switch and ⋯ (Delete) are in its header. Given room — the
 * tool in focus — what it creates and when sit on the left and its rounds on the right.
 */
export function RoutineDetail({ routine, onBack, onOlder }: {
  routine: RoutineDetailData
  onBack: () => void
  /** Reads more of its rounds; absent when there are no older ones. */
  onOlder?: () => void
}) {
  const canStartRuns = useMayWork(routine.projectId)
  const [editing, setEditing] = useState(false)
  const { busy, message, act } = useRoutineAct()
  const pauseFn = useAction(pauseRoutine)
  const resumeFn = useAction(resumeRoutine)
  const deleteFn = useAction(deleteRoutine)
  const unlinkFn = useAction(unlinkRoutineRound)
  const runNowFn = useAction(runRoutineNow)
  const skipFn = useAction(skipRoutineRound)

  if (editing) return <RoutineEdit routine={routine} onDone={() => setEditing(false)} />

  const manage = routine.canManage
  const rule = routine.rule as ScheduleRuleInput | null
  const waiting = routine.rounds.find(r => r.waiting)
  const person = routine.onBehalfOf.username ?? 'someone'
  const mayTurnOn = canStartRuns && !routine.pausedReason
  const id = { routineId: routine.id }
  const edit = manage && canStartRuns ? <RoutineEditLink onClick={() => setEditing(true)} /> : undefined

  const next = (
    <section>
      <RoutineSectionHead title="Next round" />
      {routine.enabled ? (
        <RoutineNextRound
          at={routine.nextRoundAt}
          round={waiting ? { key: waiting.key, place: routine.place } : null}
          hasAgent={!!routine.agentName}
          busy={busy}
          onRunNow={manage && canStartRuns ? () => void act(() => runNowFn(id)) : undefined}
          onSkip={manage ? () => void act(() => skipFn(id)) : undefined}
          renderOpen={children => waiting && <Link to={`/tasks/${waiting.key}`}>{children}</Link>}
        />
      ) : (
        <p className={`rounded-xl border border-border px-3.5 py-3 text-small ${routine.pausedReason ? 'text-warning' : 'text-text-muted'}`}>
          Paused{routine.pausedReason ? ` — ${routine.pausedReason}` : '. Turn it on to create its next round.'}
        </p>
      )}
    </section>
  )

  const rounds = (
    <section>
      <RoutineSectionHead title="Rounds" action={<span className="normal-case tracking-normal">newest first</span>} />
      <RoutineSquares states={routine.lastRounds} summary />
      <div className="mt-2">
        <RoutineRoundList
          rounds={routine.rounds.map(r => ({ id: r.id, key: r.key, roundAt: r.roundAt, state: r.state, reason: r.reason, tookMs: r.tookMs }))}
          renderTaskLink={(round, children) => <Link to={`/tasks/${round.key}`}>{children}</Link>}
          onUnlink={manage ? taskId => act(() => unlinkFn({ taskId })) : undefined}
          onOlder={routine.moreRounds ? onOlder : undefined}
        />
      </div>
    </section>
  )

  const agent = routine.agentName
  const made = (
    <section>
      <RoutineSectionHead title="What it creates" action={edit} />
      <RoutineFacts rows={[
        ['Title', routine.title],
        ...(routine.description ? [['Description', routine.description] as [string, string]] : []),
        ['Agent', agent ?? 'None'],
        ['Starts in', `${routine.place} — ${agent ? `${agent} starts it at its time` : 'waits for a person to start it'}`],
        ['Priority', `${PRIORITY[routine.priority] ?? routine.priority}${routine.labels.length ? ` · labels: ${routine.labels.join(', ')}` : ''}`],
      ]} />
    </section>
  )

  const when = (
    <section>
      <RoutineSectionHead title="When" action={edit} />
      <RoutineFacts rows={[
        ['Repeats', ruleSentence(rule, { at: routine.scheduleAt, timezone: routine.timezone })],
        ['Time zone', routine.timezone],
        ['On behalf of', <RoutineOnBehalfOf key="person" routine={routine} canStartRuns={canStartRuns} busy={busy} act={act} />],
      ]} />
    </section>
  )

  return (
    <div className="@container">
      <ViewHeaderRow>
        <PanelHeaderContent
          back="Routines"
          onBack={onBack}
          title={routine.title}
          action={manage && (
            <>
              <AutomationSwitch
                label={`${routine.title} on`}
                on={routine.enabled}
                disabled={busy || (!routine.enabled && !mayTurnOn)}
                onChange={on => void act(() => (on ? resumeFn(id) : pauseFn(id)))}
              />
              <OverflowMenu
                label={`More for ${routine.title}`}
                items={[{
                  label: 'Delete routine', danger: true, confirmLabel: 'Delete — its waiting round goes too',
                  onSelect: () => act(async () => { await deleteFn(id); onBack() }),
                }]}
              />
            </>
          )}
        />
      </ViewHeaderRow>
      <div className="px-4 pb-6 pt-3">
        <RoutineSentence
          rule={rule} scheduleAt={routine.scheduleAt} timezone={routine.timezone} agentName={agent}
          place={routine.place} onBehalfOf={person} createdBy={routine.createdBy}
        />
        {message && <p role="alert" className="mt-2 text-small text-danger">{message}</p>}
        <div className="@3xl:grid @3xl:grid-cols-2 @3xl:gap-x-8">
          <div className="@3xl:col-start-1 @3xl:row-start-1">{next}</div>
          <div className="@3xl:col-start-2 @3xl:row-span-3 @3xl:row-start-1">{rounds}</div>
          <div className="@3xl:col-start-1 @3xl:row-start-2">{made}</div>
          <div className="@3xl:col-start-1 @3xl:row-start-3">{when}</div>
        </div>
      </div>
    </div>
  )
}
