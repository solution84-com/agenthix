import type { ReactNode } from 'react'
import { InfoGlyph } from '../primitives/Glyphs'
import { FOCUS_RING } from '../primitives/controlStyles'

/** A link at the end of the frame line, such as the demo's to the guide; it opens in a new tab. */
export type FrameLineLink = { href: string; label: string }

/**
 * The frame line (DESIGN-SYSTEM.md, *Messages*): the state of HQ as a whole — not answering, read-only during a move,
 * and in the public demo, its countdown to the next reset — one line at a time, in the nudge's look, with at most one
 * link at its end. Drawn only when given words. The frame gives it a row of its own under the screen bar (after the
 * call bar), drawn only while it has words, so it never covers a control; the screen starts below it. On a narrow
 * screen it wraps, as a nudge does: the sentence is never cut, and the link is kept whole.
 */
export function FrameLine({ children, link }: { children?: ReactNode; link?: FrameLineLink | null }) {
  if (children === null || children === undefined || children === false || children === '') return null
  return (
    <div
      role="status" aria-live="polite" data-testid="frame-line"
      className="border-b border-border bg-surface-1 px-4 py-1 text-small text-text-secondary break-words"
    >
      <InfoGlyph size={13} className="mr-1.5 inline-block align-[-2px]" />{children}
      {link && (
        <> · <a href={link.href} target="_blank" rel="noreferrer" className={`whitespace-nowrap rounded text-link hover:underline ${FOCUS_RING}`}>{link.label}</a></>
      )}
    </div>
  )
}
