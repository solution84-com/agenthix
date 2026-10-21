import { X } from 'lucide-react'
import type { ShownPart } from '../../shared/conversations/shownParts'
import { MarkdownMessage } from '../../shared/components/MarkdownMessage'

/**
 * A shown part opened from its card: beside the thread on a wide screen, a sheet from the bottom on a phone. It
 * takes no focus and no sound from voice, which keeps going; the pill, mute and End stay in reach.
 */
export function ShownViewer({ part, onClose }: { part: ShownPart; onClose: () => void }) {
  return (
    <aside
      data-testid="shown-viewer"
      aria-label={part.title}
      className="fixed inset-x-0 bottom-0 z-40 flex max-h-[70vh] flex-col rounded-t-2xl border border-border bg-surface-1 shadow-pop lg:static lg:z-auto lg:max-h-none lg:w-[420px] lg:shrink-0 lg:rounded-none lg:border-y-0 lg:border-r-0 lg:shadow-none"
    >
      <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-border lg:hidden" aria-hidden />
      <div className="flex items-center gap-2 border-b border-border-subtle px-4 py-3">
        <h2 className="min-w-0 flex-1 truncate text-body font-medium text-text-primary">{part.title}</h2>
        <button type="button" aria-label="Close" onClick={onClose} className="flex size-8 items-center justify-center rounded-lg text-text-muted hover:bg-surface-hover hover:text-text-primary max-lg:size-10">
          <X size={16} aria-hidden />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 text-reading">
        <MarkdownMessage content={part.body} />
      </div>
    </aside>
  )
}
