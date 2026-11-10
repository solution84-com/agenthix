import type { ReactNode } from 'react'
import { File, FileImage, FileText, Loader2 } from 'lucide-react'
import type { FileFacts } from '@agenthix/core'
import { Button } from '../primitives/Button'
import { FILES_BUTTON } from '../projects/FilesToolParts'
import type { FrameNotice } from './frameStates'

// A ticket link is an http(s) address or a path on hq's own; nothing else becomes an href.
export const SAFE_LINK = /^(https?:\/\/|\/(?!\/))/i

/** Download through the relay: a link styled as a button, or the same button greyed when no byte can be fetched. */
export function DownloadButton({ link, quiet }: { link?: string; quiet?: boolean }) {
  const className = quiet ? 'text-small font-medium text-accent hover:underline' : FILES_BUTTON
  if (!link || !SAFE_LINK.test(link)) return <button type="button" className={className} disabled>Download</button>
  return <a href={link} className={className}>Download</a>
}

export function FrameLoading() {
  return (
    <p className="flex items-center gap-2 px-4 py-4 text-small text-text-muted">
      <Loader2 size={13} className="animate-spin" aria-hidden /> Loading…
    </p>
  )
}

/**
 * A state in words, in the renderer's place, with what can be done about it. Download is the header's, once: this
 * panel never draws a second one.
 */
export function FrameNoticePanel({ notice, onRetry, onAsk, hint }: {
  notice: FrameNotice
  onRetry: () => void
  /** Puts the request in the chat's message box; without it the state offers nothing to ask. */
  onAsk?: () => void
  hint?: ReactNode
}) {
  return (
    <div role="status" className="flex flex-col items-start gap-3 px-4 py-6 text-body text-text-secondary">
      <p>{notice.words}</p>
      {notice.offer === 'try-again' && <Button variant="secondary" onClick={onRetry}>Try again</Button>}
      {notice.offer === 'show-new-version' && <Button variant="secondary" onClick={onRetry}>Show the new version</Button>}
      {notice.offer === 'ask-the-agent' && onAsk && <Button variant="secondary" onClick={onAsk}>Ask the agent</Button>}
      {hint && <div className="text-small text-text-muted">{hint}</div>}
    </div>
  )
}

function CardIcon({ facts }: { facts?: FileFacts }) {
  const Icon = facts?.kind === 'image' ? FileImage : facts && facts.kind !== 'none' ? FileText : File
  return <Icon size={18} aria-hidden className="shrink-0 text-text-muted" />
}

/**
 * A file embedded in a page or a message whose renderer does not embed, or that cannot be drawn: its icon, name,
 * kind and size, and a line saying why when it cannot be shown. A click opens it; hovering shows Download.
 */
export function EmbeddedCard({ title, facts, meta, line, downloadLink, onOpen }: {
  title: string
  facts?: FileFacts
  meta: string
  line?: string
  downloadLink?: string
  onOpen?: () => void
}) {
  return (
    <div className="group my-1 flex max-w-md items-center gap-3 rounded-xl border border-border-subtle bg-surface-1 px-3 py-2 transition-colors hover:border-accent">
      <CardIcon facts={facts} />
      <button type="button" onClick={onOpen} disabled={!onOpen} className="min-w-0 flex-1 text-left">
        <span className="block truncate text-body text-text-primary">{title}</span>
        {meta && <span className="block truncate text-small text-text-muted">{meta}</span>}
        {line && <span className="block text-small text-text-secondary">{line}</span>}
      </button>
      {downloadLink && (
        <span className="opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
          <DownloadButton link={downloadLink} quiet />
        </span>
      )}
    </div>
  )
}
