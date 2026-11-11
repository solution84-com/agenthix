import type { ReactNode } from 'react'
import { InfoGlyph } from '../primitives/Glyphs'

/**
 * The frame line (DESIGN-SYSTEM.md, *Messages*): the state of HQ as a whole — not answering, read-only during a move —
 * one line at a time, in the nudge's look. Drawn only when given words. The frame gives it a row of its own under the
 * screen bar (after the call bar), drawn only while it has words, so it never covers a control; the screen moves down
 * once when it appears. It is `absolute` in that row.
 */
export function FrameLine({ children }: { children?: ReactNode }) {
  if (children === null || children === undefined || children === false || children === '') return null
  return (
    <div
      role="status" aria-live="polite" data-testid="frame-line"
      className="absolute inset-x-0 top-0 z-20 truncate border-b border-border bg-surface-1 px-4 py-1 text-small text-text-secondary"
    >
      <InfoGlyph size={13} className="mr-1.5 inline-block align-[-2px]" />{children}
    </div>
  )
}
