import { useRef, type ReactNode } from 'react'
import { holdsSkill, skillMark } from './slashQuery'

/**
 * A plain text area whose picked skill shows highlighted in the text, where it was typed. The highlight is a copy of the
 * text drawn behind the area with the same padding and font, its words transparent and only the mark painted; the area
 * itself stays the one the person types in, so the caret, selection and composition are the browser's own. The copy
 * follows the area's scroll.
 */
export function SkillBackdrop({ text, skill, className = '', children }: { text: string; skill: string | null; className?: string; children: ReactNode }) {
  const copy = useRef<HTMLDivElement>(null)
  const marked = skill !== null && holdsSkill(text, skill)
  const mark = marked ? skillMark(skill) : ''
  return (
    <div className={`relative ${className}`} onScrollCapture={(e) => { if (copy.current) copy.current.scrollTop = (e.target as HTMLElement).scrollTop }}>
      {marked && (
        <div ref={copy} aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden whitespace-pre-wrap break-words px-2 py-1.5 text-body text-transparent">
          <mark data-testid="skill-mark" className="rounded bg-selected text-transparent">{mark}</mark>{text.slice(mark.length)}
        </div>
      )}
      {children}
    </div>
  )
}
