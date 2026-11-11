import { Link } from 'react-router'
import type { ReactNode } from 'react'
import { ChevronRight, GripVertical, Play, Square } from 'lucide-react'
import { Button, FOCUS_RING } from '@agenthix/ui/primitives'
import { RunAvatar } from '@agenthix/ui/tasks'
import { AuthedAgentAvatar } from '../../shared/components/AuthedAgentAvatar'
import { NeedsYouBar, NeedsYouBars } from '../../shared/components/NeedsYouBar'
import { AgentPanels } from './AgentPanels'
import type { WorkroomAgent, WorkroomNeed, WorkroomNow } from './workroomTypes'
import { costText, needAction, needWords, ringDetail } from './workroomWords'

/** What the band's buttons do, and why each is greyed when it is. */
export type CardControls = {
  onStart?: () => void
  startWhy?: string
  startTitle: string
  onStop?: () => void
  stopWhy?: string
  stopTitle: string
  onStopRun?: (run: WorkroomNow) => void
  stopRunWhy?: string
  onAnswer: (need: WorkroomNeed) => void
  answerWhy?: string
}

const RING_STATE = { RUNNING: 'RUNNING', NEEDS_YOU: 'NEEDS_YOU', FAILED: 'FAILED', WAITING: 'WAITING' } as const

function Stat({ value, label, zero }: { value: string; label: string; zero: boolean }) {
  return (
    <div className="min-w-16 max-sm:min-w-0">
      <b className={`block text-h1 font-medium tabular-nums max-sm:text-h2 ${zero ? 'text-text-muted' : 'text-text-primary'}`}>{value}</b>
      <span className="block whitespace-nowrap text-micro text-text-muted">{label}</span>
    </div>
  )
}

function needDetail(n: WorkroomNeed): string {
  const why = needWords(n.reason)
  const said = n.detail && n.detail.toLowerCase() !== why ? `: ${n.detail}` : ''
  return [`· ${why}${said}`, n.runNumber ? `Run ${n.runNumber}` : null].filter(Boolean).join(' · ')
}

/**
 * One agent's scorecard (the Workroom design, spec D17, D18): the band — who, the numbers like a scoreboard, Start and
 * Stop, the avatar's ring as its status — then Now · In line · Finished today, and what needs a person as bars at its
 * foot. No status pill and no heavy outline: the ring and the bars say it. A quiet agent is one band and a line.
 */
export function AgentCard({ agent, now, controls, quiet, grip, more, place, short = false }: {
  agent: WorkroomAgent
  now: Date
  controls: CardControls
  /** The line under a band with nothing at work or in line. */
  quiet: string | null
  /** The drag handle, while the cards can be reordered. */
  grip?: ReactNode
  /** The phone's ⋯ (Move up, Move down). */
  more?: ReactNode
  /** On Workrooms on a phone: the project, under the name. */
  place?: { name: string; href: string }
  short?: boolean
}) {
  const ring = agent.ring ? RING_STATE[agent.ring] : null
  const avatar = <AuthedAgentAvatar name={agent.name} avatarUrl={agent.avatarUrl} size="lg" />
  const zero = (n: number) => n === 0
  return (
    <article aria-label={agent.name} className="mb-2 rounded-xl border border-border bg-card">
      <div className="flex items-center gap-3 px-4 py-3 max-sm:flex-wrap max-sm:gap-2 max-sm:p-3">
        {grip}
        <RunAvatar name={agent.name} state={ring} detail={ringDetail(agent, agent.ring)} size="lg">{avatar}</RunAvatar>
        <div className="min-w-0 basis-[196px] max-sm:flex-1 max-sm:basis-auto">
          <b className="block truncate text-h3 font-medium text-text-primary">{agent.name}</b>
          {place
            ? <Link to={place.href} className={`rounded inline-flex max-w-full items-center truncate text-micro text-link hover:underline ${FOCUS_RING}`}>{place.name}<ChevronRight size={12} aria-hidden /></Link>
            : <span className="block truncate text-micro text-text-muted">{agent.role ?? `@${agent.handle}`}</span>}
        </div>
        {more}
        <div className="ml-auto flex gap-2 border-r border-border-subtle pr-4 max-sm:m-0 max-sm:w-full max-sm:justify-between max-sm:border-0 max-sm:p-0">
          <Stat value={String(agent.needs.length)} label="Needs you" zero={zero(agent.needs.length)} />
          <Stat value={String(agent.ready)} label="Ready" zero={zero(agent.ready)} />
          <Stat value={String(agent.inLine)} label="In line" zero={zero(agent.inLine)} />
          <Stat value={String(agent.runsToday)} label="Runs today" zero={zero(agent.runsToday)} />
          <Stat value={costText(agent.spentToday)} label="Today" zero={agent.spentToday <= 0} />
        </div>
        <div className="flex gap-2 max-sm:w-full max-sm:[&>*]:flex-1 max-sm:[&>*]:justify-center">
          <Button
            variant="secondary" className="px-3" leadingIcon={<Play size={14} aria-hidden className="fill-current" />}
            disabled={!controls.onStart || !!controls.startWhy} title={controls.startWhy ?? controls.startTitle} onClick={controls.onStart}
          >
            Start
          </Button>
          <Button
            variant="secondary" className="px-3" leadingIcon={<Square size={14} aria-hidden className="fill-current" />}
            disabled={!controls.onStop || !!controls.stopWhy} title={controls.stopWhy ?? controls.stopTitle} onClick={controls.onStop}
          >
            Stop
          </Button>
        </div>
      </div>
      {quiet && <p className="-mt-1 pb-3 pl-[104px] pr-4 text-small text-text-muted max-sm:pl-3">{quiet}</p>}
      <AgentPanels agent={agent} now={now} onStopRun={controls.onStopRun} stopWhy={controls.stopRunWhy} short={short} />
      <NeedsYouBars>
        {agent.needs.map(n => (
          <NeedsYouBar
            key={n.taskId}
            agentName={agent.name}
            avatar={<AuthedAgentAvatar name={agent.name} avatarUrl={agent.avatarUrl} size="sm" />}
            state={n.reason === 'failed' ? 'FAILED' : 'NEEDS_YOU'}
            why={needWords(n.reason)}
            taskKey={n.taskKey}
            title={short ? needWords(n.reason).replace(/^./, c => c.toUpperCase()) : n.title}
            detail={short ? null : needDetail(n)}
            action={(
              <Button variant="secondary" className="px-3" disabled={!!controls.answerWhy} title={controls.answerWhy} onClick={() => controls.onAnswer(n)}>
                {needAction(n.reason)}
              </Button>
            )}
          />
        ))}
      </NeedsYouBars>
    </article>
  )
}

/** The handle a card is dragged by, with its name for the keyboard and the eye. */
export function CardGrip(props: { label: string } & Record<string, unknown>) {
  const { label, ...rest } = props
  return (
    <span {...rest} role="button" tabIndex={0} aria-label={label} title={label} className={`inline-flex shrink-0 cursor-grab items-center rounded text-text-muted ${FOCUS_RING} max-lg:hidden`}>
      <GripVertical size={16} aria-hidden />
    </span>
  )
}
