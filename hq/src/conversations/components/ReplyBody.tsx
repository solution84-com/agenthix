import { memo, useMemo } from 'react'
import { FileText } from 'lucide-react'
import { CARD_CLICKABLE } from '@agenthix/ui/primitives'
import { splitShownParts, type ShownPart } from '../../shared/conversations/shownParts'
import { MarkdownMessage, type MarkdownEmbedContext } from '../../shared/components/MarkdownMessage'
import { useConversationEmbed } from './conversationFiles'
import { revealedText } from '../voiceClient/reveal'
import { useReveal } from '../../shared/components/reveal/useReveal'
import type { RevealMarks } from '../../shared/components/reveal/rehypeReveal'

/** How a reply's shown parts are drawn: as cards that open a viewer in voice mode, inline outside it. */
export type ReplyView = {
  inVoice: boolean
  /**
   * How much of a reply's text is laid out now while voice speaks it (to the end of the sentence being revealed);
   * null for all of it.
   */
  limitFor: (turnId: string | undefined, text: string) => number | null
  /** Where a reply's reveal heads while voice speaks it: a little ahead of the voice. Null: the end of what is laid out. */
  targetFor?: (turnId: string | undefined, text: string) => number | null
  /** Opens the `index`-th shown part of the reply named `key`. */
  onOpenPart: (key: string, index: number) => void
}

export function ShownCard({ part, onOpen }: { part: ShownPart; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      data-testid="shown-card"
      className={`flex w-full max-w-sm items-center gap-3 rounded-xl border bg-card px-3 py-2.5 text-left ${CARD_CLICKABLE} max-lg:min-h-12`}
    >
      <FileText size={18} aria-hidden className="shrink-0 text-text-secondary" />
      <span className="min-w-0 flex-1 truncate text-small font-medium text-text-primary">{part.title}</span>
      <span className="shrink-0 text-small font-medium text-text-secondary">Open</span>
    </button>
  )
}

const sameEmbed = (a?: MarkdownEmbedContext, b?: MarkdownEmbedContext) => a === b || (!!a && !!b && a.place === b.place
  && a.folder === b.folder && a.onOpen === b.onOpen && a.onOpenTaskFile === b.onOpenTaskFile && a.placePath === b.placePath && a.writtenAt === b.writtenAt)

/** Drawn again only when its text, its embeds or what it reveals change: never for a frame of the reveal. */
const RevealedMarkdown = memo(MarkdownMessage, (a, b) => a.content === b.content && a.reveal === b.reveal && a.className === b.className && sameEmbed(a.embed, b.embed))

function InlinePart({ part, embed, reveal }: { part: ShownPart; embed?: MarkdownEmbedContext; reveal?: RevealMarks }) {
  return (
    <section data-testid="shown-inline" className="rounded-xl border border-border-subtle px-4 py-3">
      <h3 className="pb-1 text-small font-medium text-text-primary">{part.title}</h3>
      <RevealedMarkdown content={part.body} embed={embed} reveal={reveal} />
    </section>
  )
}

/**
 * Where each piece of text lies in `whole`, searched in order, so the arrivals can be cut to it; null when it cannot
 * be found (a skipped line inside it), and it is then drawn whole.
 */
function offsetsIn(whole: string, texts: string[]): (number | null)[] {
  let from = 0
  return texts.map((t) => {
    const at = whole.indexOf(t, from)
    if (at < 0) return null
    from = at + t.length
    return at
  })
}

/**
 * A reply's words, the newly arrived ones revealed: one position eases through the text and each character fades in
 * as it passes. `limit` is how far the text is laid out (to the end of the sentence voice is revealing, or what was
 * heard once voice stopped it); `target` is where the reveal heads (ahead of the voice). Shown parts become cards in
 * voice mode (their body opens beside the thread) and stay inline outside it. A card takes its title from the whole
 * reply, so it does not change word by word while the reply is revealed. In a conversation, paths and images are read
 * in its place.
 */
export function ReplyBody({ text, limit = null, target = null, replyKey, view, writtenAt, live = false }: {
  text: string
  limit?: number | null
  target?: number | null
  replyKey: string
  view?: ReplyView
  /** The reply is streaming in: it reveals from its first words, and the stored reply that follows carries on. */
  live?: boolean
  /** When the reply was written, so a file it names that changed since says so; absent while it streams. */
  writtenAt?: string
}) {
  const embed = useConversationEmbed(writtenAt)
  const visible = revealedText(text, limit)
  // Text arriving reveals from its first words: streaming, or revealed with the voice. The stored reply that takes a
  // stream's place, under the same key, carries on from where the reveal was.
  const reveal = useReveal({ text: visible, target, arriving: live || limit !== null, live, handOver: replyKey })
  const segments = useMemo(() => splitShownParts(visible), [visible])
  // Each piece's marks, by its place in the reply's text, made again only when the text or what it reveals changes.
  const marks = useMemo(() => {
    const offsets = offsetsIn(visible, segments.map((s) => (s.kind === 'prose' ? s.text : s.part.body)))
    return offsets.map((at) => (at === null || !reveal.marks ? undefined : { ...reveal.marks, offset: at }))
  }, [visible, segments, reveal.marks])
  const whole = limit === null ? segments : splitShownParts(text)
  const wholeParts = whole.filter((s) => s.kind === 'shown')
  let shownSoFar = 0
  return (
    <div ref={reveal.ref} className="space-y-3" data-reply-text data-whole={!live && visible.length === text.length ? '' : undefined}>
      {segments.map((s, i) => {
        if (s.kind === 'prose') return <RevealedMarkdown key={i} content={s.text} embed={embed} reveal={marks[i]} />
        const index = shownSoFar++
        const part = (wholeParts[index]?.kind === 'shown' ? wholeParts[index].part : s.part)
        return view?.inVoice
          ? <ShownCard key={i} part={part} onOpen={() => view.onOpenPart(replyKey, index)} />
          : <InlinePart key={i} part={part} embed={embed} reveal={part === s.part ? marks[i] : undefined} />
      })}
    </div>
  )
}
