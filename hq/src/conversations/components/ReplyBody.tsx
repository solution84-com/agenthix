import { FileText } from 'lucide-react'
import { splitShownParts, type ShownPart } from '../../shared/conversations/shownParts'
import { MarkdownMessage, type MarkdownEmbedContext } from '../../shared/components/MarkdownMessage'
import { useConversationEmbed } from './conversationFiles'

/** How a reply's shown parts are drawn: as cards that open a viewer in voice mode, inline outside it. */
export type ReplyView = {
  inVoice: boolean
  /** How much of a reply's text may show now (the part heard so far while it is spoken); null for all of it. */
  limitFor: (turnId: string | undefined, text: string) => number | null
  /** Opens the `index`-th shown part of the reply named `key`. */
  onOpenPart: (key: string, index: number) => void
}

export function ShownCard({ part, onOpen }: { part: ShownPart; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      data-testid="shown-card"
      className="flex w-full max-w-sm items-center gap-3 rounded-xl border border-border bg-surface-1 px-3 py-2.5 text-left hover:bg-surface-hover max-lg:min-h-12"
    >
      <FileText size={18} aria-hidden className="shrink-0 text-accent" />
      <span className="min-w-0 flex-1 truncate text-small font-medium text-text-primary">{part.title}</span>
      <span className="shrink-0 text-small font-medium text-accent">Open</span>
    </button>
  )
}

function InlinePart({ part, embed }: { part: ShownPart; embed?: MarkdownEmbedContext }) {
  return (
    <section data-testid="shown-inline" className="rounded-xl border border-border-subtle px-4 py-3">
      <h3 className="pb-1 text-small font-semibold text-text-primary">{part.title}</h3>
      <MarkdownMessage content={part.body} embed={embed} />
    </section>
  )
}

/**
 * A reply's words. `limit` holds back the text not yet heard; shown parts become cards in voice mode (their body
 * opens beside the thread) and stay inline outside it. A card takes its title from the whole reply, so it does not
 * change word by word while the reply is revealed. In a conversation, paths and images are read in its place.
 */
export function ReplyBody({ text, limit = null, replyKey, view, writtenAt }: {
  text: string
  limit?: number | null
  replyKey: string
  view?: ReplyView
  /** When the reply was written, so a file it names that changed since says so; absent while it streams. */
  writtenAt?: string
}) {
  const embed = useConversationEmbed(writtenAt)
  const visible = limit === null ? text : text.slice(0, limit)
  const segments = splitShownParts(visible)
  const whole = limit === null ? segments : splitShownParts(text)
  const wholeParts = whole.filter((s) => s.kind === 'shown')
  let shownSoFar = 0
  return (
    <div className="space-y-3">
      {segments.map((s, i) => {
        if (s.kind === 'prose') return <MarkdownMessage key={i} content={s.text} embed={embed} />
        const index = shownSoFar++
        const part = (wholeParts[index]?.kind === 'shown' ? wholeParts[index].part : s.part)
        return view?.inVoice
          ? <ShownCard key={i} part={part} onOpen={() => view.onOpenPart(replyKey, index)} />
          : <InlinePart key={i} part={part} embed={embed} />
      })}
    </div>
  )
}
