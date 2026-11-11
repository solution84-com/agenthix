import ReactMarkdown, { type Options } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { isValidElement, useMemo, useRef, useState, type ReactElement, type ReactNode } from 'react'
import { Check, Copy } from 'lucide-react'
import { DISABLED, FOCUS_RING } from '@agenthix/ui/primitives'
import { copyText } from '../copyText'
import { embedComponents } from './markdownEmbed/embedComponents'
import { rehypeImgTags } from './markdownEmbed/imgTag'
import { PlainImage } from './markdownEmbed/plainImage'
import { remarkReferences } from './markdownEmbed/remarkReferences'
import type { MarkdownEmbedContext } from './markdownEmbed/embedTarget'
import { rehypeReveal, type RevealMarks } from './reveal/rehypeReveal'

export type { MarkdownEmbedContext } from './markdownEmbed/embedTarget'

function CodeBlock({ children, className }: { children?: React.ReactNode; className?: string }) {
  const [copied, setCopied] = useState<'yes' | 'failed' | null>(null)
  const code = String(children ?? '').replace(/\n$/, '')

  const handleCopy = async () => {
    setCopied((await copyText(code)) ? 'yes' : 'failed')
    setTimeout(() => setCopied(null), 2000)
  }

  return (
    <div className="relative group/code my-3 rounded-xl overflow-hidden border border-border">
      <div className="flex items-center justify-between px-4 py-1 bg-surface-3 border-b border-border">
        <span className="text-micro text-text-muted font-mono uppercase tracking-wide">
          {className?.replace('language-', '') || 'code'}
        </span>
        <button
          onClick={() => void handleCopy()}
          className={`flex h-9 items-center gap-1.5 rounded-lg border border-border bg-button-secondary px-3 text-small font-medium text-text-primary not-disabled:hover:bg-surface-hover not-disabled:hover:border-border-strong not-disabled:active:bg-surface-pressed transition-colors cursor-pointer max-sm:h-11 ${FOCUS_RING} ${DISABLED}`}
        >
          {copied === 'yes' ? (
            <><Check className="w-3 h-3 text-success" /><span className="text-success">Copied</span></>
          ) : copied === 'failed' ? (
            <span className="text-danger">Could not copy: select the text</span>
          ) : (
            <><Copy className="w-3 h-3" /><span>Copy</span></>
          )}
        </button>
      </div>
      <pre className="p-4 overflow-x-auto bg-surface-2 text-body">
        <code className="font-mono text-text-primary">{code}</code>
      </pre>
    </div>
  )
}

interface MarkdownMessageProps {
  content: string
  className?: string
  /**
   * The place the text belongs to. With it, images and links to files resolve in that place and embed through the
   * relay, a sized image tag is drawn, and other websites' images wait for Load (spec part 2, *Embedded files*).
   * Without it, the text is drawn exactly as before.
   */
  embed?: MarkdownEmbedContext
  /** A reply being revealed: its characters still fading in are drawn as spans the reveal fades (`reveal/`). */
  reveal?: RevealMarks
}

const link = (href: string | undefined, children: ReactNode) => (
  <a
    href={href}
    target="_blank"
    rel="noopener noreferrer"
    className={`rounded text-link hover:underline underline underline-offset-2 ${FOCUS_RING}`}
  >
    {children}
  </a>
)

const paragraph = (children: ReactNode) => (
  <p className="mb-3 last:mb-0 leading-relaxed text-text-primary">{children}</p>
)

const remarkPlugins = [remarkGfm]
// In a conversation's place, a path the agent wrote is a link to its file too.
const ownerRemarkPlugins = [remarkGfm, remarkReferences]
const embedRehypePlugins = [rehypeImgTags]

/**
 * The embed components, made again only when the place or folder changes: a caller passing a new context object each
 * render must not remount every embed (and ask for its file again).
 */
function useEmbedComponents(embed: MarkdownEmbedContext | undefined) {
  const onOpen = useRef(embed?.onOpen)
  onOpen.current = embed?.onOpen
  const onOpenTaskFile = useRef(embed?.onOpenTaskFile)
  onOpenTaskFile.current = embed?.onOpenTaskFile
  const key = embed ? JSON.stringify([embed.place, embed.folder, !!embed.onOpen, !!embed.onOpenTaskFile, embed.placePath, embed.writtenAt]) : null
  return useMemo(() => {
    if (!embed) return null
    const open = embed.onOpen ? (ref: Parameters<NonNullable<MarkdownEmbedContext['onOpen']>>[0]) => onOpen.current?.(ref) : undefined
    const openTaskFile = embed.onOpenTaskFile
      ? (file: Parameters<NonNullable<MarkdownEmbedContext['onOpenTaskFile']>>[0]) => onOpenTaskFile.current?.(file)
      : undefined
    const { place, folder, placePath, writtenAt } = embed
    return embedComponents({ place, folder, onOpen: open, onOpenTaskFile: openTaskFile, placePath, writtenAt }, link, paragraph)
    // Keyed by what the context says, not by its identity.
  }, [key])
}

export function MarkdownMessage({ content, className, embed, reveal }: MarkdownMessageProps) {
  const embedded = useEmbedComponents(embed)
  const rehypePlugins: Options['rehypePlugins'] = reveal
    ? [...(embedded ? embedRehypePlugins : []), [rehypeReveal, { marks: reveal }]]
    : embedded ? embedRehypePlugins : undefined
  return (
    <div className={`prose-markdown ${className ?? ''}`}>
      <ReactMarkdown
        remarkPlugins={embed?.place.space === 'owner' ? ownerRemarkPlugins : remarkPlugins}
        rehypePlugins={rehypePlugins}
        components={{
          // A fenced block arrives as <pre><code>; only that is a block. Judging by the language class instead
          // made a block with no language render inline, its lines run together.
          code: ({ children }) => (
            <code className="bg-chip text-text-primary px-1.5 py-0.5 rounded text-small font-mono">{children}</code>
          ),
          pre: ({ children }) => {
            const inner = isValidElement(children) ? (children as ReactElement<{ className?: string; children?: ReactNode }>).props : {}
            return <CodeBlock className={inner.className}>{inner.children}</CodeBlock>
          },
          p: ({ children }) => paragraph(children),
          h1: ({ children }) => (
            <h1 className="text-h2 font-medium text-text-primary mb-2 mt-4 first:mt-0">{children}</h1>
          ),
          h2: ({ children }) => (
            <h2 className="text-h3 font-medium text-text-primary mb-2 mt-3 first:mt-0">{children}</h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-body font-medium text-text-primary mb-1.5 mt-3 first:mt-0">{children}</h3>
          ),
          ul: ({ children }) => (
            <ul className="mb-3 pl-5 space-y-1 list-disc marker:text-text-muted">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="mb-3 pl-5 space-y-1 list-decimal marker:text-text-muted">{children}</ol>
          ),
          // A task-list item has its checkbox in place of a bullet.
          li: ({ children, className }) => (
            <li className={`text-text-primary leading-relaxed ${className?.includes('task-list-item') ? 'list-none -ml-5' : ''}`}>{children}</li>
          ),
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-border-strong pl-4 my-3 text-text-secondary italic">
              {children}
            </blockquote>
          ),
          strong: ({ children }) => (
            <strong className="font-semibold text-text-primary">{children}</strong>
          ),
          em: ({ children }) => (
            <em className="italic text-text-secondary">{children}</em>
          ),
          img: ({ src, alt, width, height }) => <PlainImage src={src} alt={alt} width={width} height={height} />,
          hr: () => <hr className="border-border my-4" />,
          a: ({ href, children }) => link(href, children),
          table: ({ children }) => (
            <div className="overflow-x-auto my-3">
              <table className="w-full text-body border-collapse">{children}</table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="bg-surface-3">{children}</thead>
          ),
          th: ({ children }) => (
            <th className="px-3 py-2 text-left text-text-secondary font-medium border border-border text-small">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="px-3 py-2 text-text-primary border border-border">{children}</td>
          ),
          tr: ({ children }) => (
            <tr className="border-b border-border hover:bg-surface-hover">{children}</tr>
          ),
          ...embedded,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}

/** For a renderer that draws Markdown from text alone (the Files tool's): Markdown drawn with this place's embeds. */
export const renderMarkdownIn = (embed?: MarkdownEmbedContext) => (markdown: string) => (
  <MarkdownMessage content={markdown} embed={embed} />
)
