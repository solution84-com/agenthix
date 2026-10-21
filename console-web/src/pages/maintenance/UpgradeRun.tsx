import { Check, Circle, CircleDot, X } from 'lucide-react'
import type { ChangeEntry, UpgradeStep } from './words'
import { upgradeSteps } from './words'
import { whenIs } from '../dashboard/words'

const MARK = {
  done: <Check size={14} aria-label="done" className="text-success" />,
  now: <CircleDot size={14} aria-label="now" className="text-accent" />,
  waiting: <Circle size={14} aria-label="waiting" className="text-text-muted" />,
  failed: <X size={14} aria-label="failed" className="text-danger" />,
}

function Step({ step, now }: { step: UpgradeStep; now: Date }) {
  return (
    <li className="flex items-start gap-2 py-1 text-small">
      <span className="mt-0.5">{MARK[step.mark]}</span>
      <span className="min-w-0 flex-1">
        <span className="font-medium text-text-primary">{step.label}</span>
        {step.detail && <span className="block text-text-secondary">{step.detail}</span>}
      </span>
      {step.at && <span className="text-text-muted">{whenIs(step.at, now)}</span>}
    </li>
  )
}

/**
 * An upgrade under way, or one that failed and rolled back (board *An upgrade, running and rolled back*): the steps
 * the host service has reported. Its notices carry the stages, not the checks inside them, so only those are drawn.
 */
export function UpgradeRun({ entry, now }: { entry: ChangeEntry; now: Date }) {
  const steps = upgradeSteps(entry.notices, entry.change)
  const rolledBack = entry.change.state === 'rolledBack'
  return (
    <div className="mt-2 border-t border-border pt-2">
      {rolledBack && (
        <p className="mb-1 text-small text-text-primary">
          The upgrade{entry.change.detail ? ` to ${entry.change.detail.replace(/^to\s+/i, '')}` : ''} failed and was rolled back.
          {' '}What was there before runs again.
        </p>
      )}
      <ol aria-label="The upgrade's steps">{steps.map(s => <Step key={s.label} step={s} now={now} />)}</ol>
    </div>
  )
}
