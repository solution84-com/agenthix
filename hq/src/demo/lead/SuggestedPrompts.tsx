import { DISABLED, FOCUS_RING, SCROLL_EDGE_FADE } from '@agenthix/ui/primitives'

const CHIP = `shrink-0 whitespace-nowrap rounded-full bg-chip text-small text-text-primary transition-colors not-disabled:hover:bg-surface-hover not-disabled:active:bg-surface-pressed ${FOCUS_RING} ${DISABLED}`

/**
 * What the demo's agent answers, above the message box (ADR-0186): one tap sends that message. Wrapped on a wide
 * screen; on a phone, one row that scrolls sideways and fades at its edge, so a chip cut there shows there is more.
 * `compact` once the conversation is under way: the same, with smaller chips, so the prompts the agents' fallback
 * points to stay there without taking much room from the thread, and none is cut without a sign.
 */
export function SuggestedPrompts({ prompts, onPick, disabled = false, compact = false }: {
  prompts: readonly string[]
  onPick: (text: string) => void
  disabled?: boolean
  compact?: boolean
}) {
  if (prompts.length === 0) return null
  const row = `${compact ? 'gap-1 pb-1.5' : 'gap-1.5 pb-2'} sm:flex-wrap max-sm:overflow-x-auto max-sm:pr-8`
  return (
    <div
      role="group"
      aria-label="Try asking"
      data-testid="suggested-prompts"
      data-compact={compact ? 'true' : undefined}
      className={`flex px-1 ${row} ${SCROLL_EDGE_FADE}`}
    >
      {prompts.map(prompt => (
        <button key={prompt} type="button" className={`${CHIP} ${compact ? 'px-2.5 py-0.5' : 'px-3 py-1'}`} disabled={disabled} onClick={() => onPick(prompt)}>
          {prompt}
        </button>
      ))}
    </div>
  )
}
