import { ArrowDown } from 'lucide-react'
import { FOCUS_RING } from '@agenthix/ui/primitives'

/** A round ↓ over the foot of the thread, `lift` pixels above it when a box floats there, while it is scrolled up; a dot when a new answer has arrived. */
/**
 * The round button that takes the person to the end of the thread, once. `writing`: the newest words, out of sight,
 * are still being written: the arrow gives way to the typing dots.
 */
export function JumpToLatest({ arrived, onJump, lift = 0, writing = false }: { arrived: boolean; onJump: () => void; lift?: number; writing?: boolean }) {
  return (
    <button
      type="button"
      onClick={onJump}
      aria-label={writing ? 'Jump to the latest, still being written' : arrived ? 'Jump to the latest, a new answer has arrived' : 'Jump to the latest'}
      title="Jump to the latest"
      data-testid="jump-to-latest"
      style={{ bottom: lift + 12 }}
      className={`absolute left-1/2 flex h-9 w-9 -translate-x-1/2 items-center justify-center rounded-full border border-border bg-popover text-text-secondary shadow-pop hover:bg-surface-hover active:bg-surface-pressed ${FOCUS_RING} hover:text-text-primary max-lg:h-11 max-lg:w-11`}
    >
      {writing ? (
        <span aria-hidden className="flex items-center gap-0.5" data-testid="jump-writing">
          {[0, 150, 300].map((delay) => (
            <span key={delay} className="live-line-dot h-1.5 w-1.5 rounded-full bg-text-secondary" style={{ animationDelay: `${delay}ms` }} />
          ))}
        </span>
      ) : <ArrowDown size={16} aria-hidden />}
      {arrived && !writing && <span data-testid="jump-dot" className="absolute right-0.5 top-0.5 h-2.5 w-2.5 rounded-full border-2 border-surface-1 bg-text-primary" />}
    </button>
  )
}
