import { X } from 'lucide-react'
import type { RoutineRunView } from '../../shared/routineTypes'
import { MARK_WORDS, marksLabel, runMark, type RunMark } from './routineWords'

/** One run's mark: a shape for each ending, the colour only repeating it (a square, ✕, a dot, a dashed square). */
export function RunMarkGlyph({ mark, title }: { mark: RunMark; title?: string }) {
  const name = title ?? MARK_WORDS[mark]
  const box = 'inline-flex size-2.5 shrink-0 items-center justify-center'
  switch (mark) {
    case 'finished': return <i aria-hidden title={name} className={`${box} rounded-[2px] bg-success`} />
    case 'failed': return <i aria-hidden title={name} className={`${box} text-danger`}><X size={11} strokeWidth={3.5} /></i>
    case 'asked': return <i aria-hidden title={name} className={box}><span className="size-[7px] rounded-full bg-warning" /></i>
    case 'skipped': return <i aria-hidden title={name} className={`${box} rounded-[2px] border border-dashed border-text-muted`} />
    case 'going': return <i aria-hidden title={name} className={`${box} rounded-full border-2 border-text-primary`} />
    case 'stopped': return <i aria-hidden title={name} className={`${box} rounded-[2px] border border-text-muted`} />
  }
}

/** A routine's last firings, oldest first, as marks; their tally is its accessible name. */
export function RoutineMarks({ runs }: { runs: RoutineRunView[] }) {
  if (runs.length === 0) return null
  const oldestFirst = [...runs].reverse()
  return (
    <span role="img" aria-label={marksLabel(runs)} title={marksLabel(runs)} className="inline-flex items-center gap-[3px]">
      {oldestFirst.map(r => <RunMarkGlyph key={r.id} mark={runMark(r)} />)}
    </span>
  )
}
