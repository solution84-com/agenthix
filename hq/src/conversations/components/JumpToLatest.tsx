import { ArrowDown } from 'lucide-react'
import { FOCUS_RING } from '@agenthix/ui/primitives'

/** A round ↓ over the foot of the thread, `lift` pixels above it when a box floats there, while it is scrolled up; a dot when a new answer has arrived. */
export function JumpToLatest({ arrived, onJump, lift = 0 }: { arrived: boolean; onJump: () => void; lift?: number }) {
  return (
    <button
      type="button"
      onClick={onJump}
      aria-label={arrived ? 'Jump to the latest, a new answer has arrived' : 'Jump to the latest'}
      title="Jump to the latest"
      data-testid="jump-to-latest"
      style={{ bottom: lift + 12 }}
      className={`absolute left-1/2 flex h-9 w-9 -translate-x-1/2 items-center justify-center rounded-full border border-border bg-popover text-text-secondary shadow-pop hover:bg-surface-hover active:bg-surface-pressed ${FOCUS_RING} hover:text-text-primary max-lg:h-11 max-lg:w-11`}
    >
      <ArrowDown size={16} aria-hidden />
      {arrived && <span data-testid="jump-dot" className="absolute right-0.5 top-0.5 h-2.5 w-2.5 rounded-full border-2 border-surface-1 bg-text-primary" />}
    </button>
  )
}
