import { useState } from 'react'
import { Link } from 'react-router'
import { daysLeftText, dayText, epicActivityText, epicTaskOrder, childWords, type EpicChild, type EpicProgress } from './taskPageState'

/** One of an epic's tasks, as its Tasks tab lists it. */
export type EpicTaskRow = EpicChild & { key: string; title: string; columnLabel: string; agentName: string | null }

function Ring({ done, total }: { done: number; total: number }) {
  const r = 16
  const c = 2 * Math.PI * r
  const share = total ? done / total : 0
  return (
    <svg width="44" height="44" viewBox="0 0 40 40" role="img" aria-label={`${done} of ${total} done`} className="shrink-0">
      <circle cx="20" cy="20" r={r} fill="none" strokeWidth="4" className="stroke-surface-3" />
      <circle
        cx="20" cy="20" r={r} fill="none" strokeWidth="4" strokeLinecap="round" className="stroke-accent"
        strokeDasharray={`${share * c} ${c}`} transform="rotate(-90 20 20)"
      />
    </svg>
  )
}

/** Where a task has its Now block, an epic has its progress (T10): the ring, what is done, what is happening, its milestone. */
export function EpicProgressBlock({ progress, milestone, now }: { progress: EpicProgress; milestone: { name: string; date: string | Date } | null; now: Date }) {
  const happening = epicActivityText(progress)
  return (
    <section aria-label="Progress" className="flex flex-wrap items-center gap-4 rounded-xl border border-border-subtle bg-surface-1 px-4 py-3">
      <Ring done={progress.done} total={progress.total} />
      <div className="min-w-0 flex-1">
        <p className="text-body font-medium text-text-primary">
          {progress.total ? `${progress.done} of ${progress.total} done` : 'No tasks in it yet'}
        </p>
        {happening && <p className="text-small text-text-secondary">{happening}</p>}
      </div>
      {milestone && (
        <div className="text-right">
          <p className="text-small text-text-primary">{milestone.name} · {dayText(milestone.date)}</p>
          <p className="text-small text-text-muted">{daysLeftText(milestone.date, now)}</p>
        </div>
      )}
    </section>
  )
}

function Row({ t, now }: { t: EpicTaskRow; now: Date }) {
  const w = childWords(t, now)
  return (
    <li>
      <Link to={`/tasks/${t.key}`} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 rounded-lg px-2 py-2 hover:bg-surface-hover">
        <span className="min-w-0 truncate text-body text-text-primary">{t.title}</span>
        <span className="rounded-full border border-border px-2 py-0.5 text-micro text-text-secondary">{t.columnLabel}</span>
        <span className={`ml-auto text-small ${w.tone === 'needs' ? 'text-warning' : w.tone === 'live' ? 'text-success' : 'text-text-muted'}`}>{w.text}</span>
        <span className="w-full text-micro text-text-muted">{[t.key, t.agentName].filter(Boolean).join(' · ')}</span>
      </Link>
    </li>
  )
}

/**
 * An epic's Tasks tab (T10): its open tasks by importance, its done ones folded, and the way to add one. The rows are
 * plain; the task lists' own row takes their place where it exists.
 */
export function EpicTasks({ tasks, now, addHref }: { tasks: EpicTaskRow[]; now: Date; addHref?: string }) {
  const [showDone, setShowDone] = useState(false)
  const { open, done } = epicTaskOrder(tasks, now)
  return (
    <div className="space-y-2">
      {open.length === 0 && done.length === 0 && <p className="text-small text-text-muted">No tasks are filed under this epic yet.</p>}
      <ul aria-label="Open tasks" className="divide-y divide-border-subtle">{open.map(t => <Row key={t.id} t={t} now={now} />)}</ul>
      {done.length > 0 && (
        <div>
          <button type="button" aria-expanded={showDone} onClick={() => setShowDone(v => !v)} className="text-small text-text-muted hover:text-text-primary">
            {showDone ? '▾' : '▸'} {done.length} done · {showDone ? 'Hide' : 'Show'}
          </button>
          {showDone && <ul aria-label="Done tasks" className="divide-y divide-border-subtle">{done.map(t => <Row key={t.id} t={t} now={now} />)}</ul>}
        </div>
      )}
      {addHref && <Link to={addHref} className="inline-block text-small text-accent hover:underline">＋ Add a task to this epic</Link>}
    </div>
  )
}
