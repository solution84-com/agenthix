import { useCallback, useState, type ReactNode } from 'react'
import type { FileOpenAnswer, RendererMode, RendererReport } from '@agenthix/core'
import type { OverflowItem } from '../tasks/OverflowMenu'
import { DownloadButton, EmbeddedCard, FrameLoading, FrameNoticePanel } from './FileFrameParts'
import { FrameHeader } from './FrameHeader'
import {
  canDownload, emptyNotice, factsLine, noticeOfReport, partialWords, viewOfAnswer, type FrameStateId, type FrameView,
} from './frameStates'
import { defaultRegistry, type RendererRegistry } from './registry'
import { RendererHost } from './RendererHost'

export interface FileFrameProps {
  /** hq's open answer; undefined while it is being asked for. */
  answer: FileOpenAnswer | undefined
  /** The file's name, shown while the answer has no facts. */
  name: string
  /** The title, when it is not the file's name (a knowledge page's). */
  title?: string
  /** Where it lives, above the title: ["Files", "reports"]. */
  breadcrumb?: readonly string[]
  /** "Changed today 10:42 by an agent run", where the caller knows. */
  changed?: string
  /** "‹ QR-1": back to where the person came from. The header puts the name on a line of its own when narrow. */
  back?: { label: string; onBack: () => void }
  /** The Files tool: ▤ in the header shows the folder beside the file (decision D1). */
  folderToggle?: { shown: boolean; onToggle: () => void }
  /** Opened fills its area inside the frame; embedded sits in a page or a message, with no controls. */
  mode?: RendererMode
  /**
   * By default an opened file fills the space its container gives the frame, and the file scrolls inside it, so the
   * header, facts line and actions stay in place. `grow` lets the frame take the height of its file instead, for a
   * caller whose page scrolls as a whole.
   */
  grow?: boolean
  registry?: RendererRegistry
  /** The caller's words after an action, shown for a moment under the actions: "Link copied." */
  notice?: string
  onMention?: () => void
  onCopyLink?: () => void
  onCopyPath?: () => void
  /** Opens the file in its place's Files tool (a file opened where it was mentioned). */
  onShowInFiles?: () => void
  onFullScreen?: () => void
  /** ✕ in the header: closing returns to the same page (full screen back to the viewer). */
  onClose?: () => void
  /** "Ask the agent" on a file that can't be opened: puts the request in the chat's message box for the person to send. */
  onAsk?: () => void
  /** Try again and Show the new version: open the file afresh. */
  onReopen: () => void
  /** Embedded: a click opens the file. */
  onOpen?: () => void
  /** What an admin can do, drawn under a state's words: a link to how to set up a files address or a relay. */
  adminHint?: (state: FrameStateId) => ReactNode
}

function menuItems(props: FileFrameProps): OverflowItem[] {
  const items: OverflowItem[] = []
  if (props.onCopyLink) items.push({ label: 'Copy link', onSelect: props.onCopyLink })
  if (props.onCopyPath) items.push({ label: 'Copy path', onSelect: props.onCopyPath })
  if (props.onShowInFiles) items.push({ label: 'Show in Files', onSelect: props.onShowInFiles })
  if (props.onMention) items.push({ label: 'Mention', onSelect: props.onMention })
  return items
}

/**
 * A renderer's file and version. A new version mounts it afresh; renewed tickets for the same version (a new preview
 * link) do not, so a PDF keeps its page and nothing is read again. Another file always passes through `opening`.
 */
const viewKey = (view: FrameView) =>
  view.phase === 'render' ? `render|${view.facts.kind}|${view.facts.name}|${view.facts.version}` : view.phase

/**
 * The frame around every file Agenthix shows (adr-0155): its header, facts line and actions, and every state in
 * words. The renderer draws only inside it, from the file's facts and bytes.
 */
export function FileFrame(props: FileFrameProps) {
  const view = viewOfAnswer(props.answer, props.registry ?? defaultRegistry)
  return <FrameForView key={viewKey(view)} view={view} {...props} />
}

function FrameForView({ view, ...props }: FileFrameProps & { view: FrameView }) {
  const [report, setReport] = useState<RendererReport>()
  const [kindFact, setKindFact] = useState<string>()
  const onReport = useCallback((r: RendererReport) => setReport(r), [])
  const onFact = useCallback((text: string) => setKindFact(text), [])

  const facts = view.phase === 'opening' ? undefined : view.facts
  const notice = view.phase === 'notice' ? view.notice : view.phase === 'render' ? emptyNotice(view.facts) ?? noticeOfReport(report, view.facts) : null
  const downloadLink = canDownload(view, notice) && view.phase !== 'opening' ? view.downloadLink : undefined
  const title = props.title ?? facts?.name ?? props.name
  const mode = props.mode ?? 'opened'
  const line = factsLine(facts, props.changed, kindFact)
  const renderer = view.phase === 'render' && !notice ? (
    <RendererHost renderer={view.renderer} facts={view.facts} link={view.previewLink} mode={mode} onReport={onReport} onFact={onFact} />
  ) : null

  if (mode === 'embedded') {
    if (renderer && view.phase === 'render' && view.renderer.embeds) return <div className="my-1 max-w-full">{renderer}</div>
    return (
      <EmbeddedCard title={title} facts={facts} meta={line} line={notice?.words} downloadLink={downloadLink} onOpen={props.onOpen} />
    )
  }

  const partial = view.phase === 'render' && !notice ? partialWords(report, view.facts) : null
  const fills = view.phase === 'render' && view.renderer.fills
  const statusLine = line

  return (
    <div className={props.grow ? 'min-w-0' : 'flex h-full min-h-0 min-w-0 flex-1 flex-col'} data-testid="file-frame">
      <FrameHeader
        title={title} breadcrumb={props.breadcrumb} back={props.back} folderToggle={props.folderToggle}
        downloadLink={downloadLink} onFullScreen={props.onFullScreen} menu={menuItems(props)} onClose={props.onClose}
        notice={props.notice}
      />
      {(statusLine || partial) && (
        <div className="shrink-0 border-b border-border-subtle px-4 py-3" data-testid="file-frame-band">
          {statusLine && <p role="status" className="text-small text-text-muted">{statusLine}</p>}
          {partial && <p className={`text-small text-text-secondary ${statusLine ? 'mt-1' : ''}`}>{partial}</p>}
        </div>
      )}
      {view.phase === 'opening' && <FrameLoading />}
      {notice && (
        <FrameNoticePanel notice={notice} onRetry={props.onReopen} onAsk={props.onAsk} hint={props.adminHint?.(notice.state)} />
      )}
      {renderer && (
        <div className={viewClass(props.grow, fills)} data-testid="file-frame-view">
          {renderer}
        </div>
      )}
    </div>
  )
}

/**
 * The frame's view of the file. It scrolls, unless the renderer fills it and scrolls in one place of its own (a table,
 * a PDF); a page that scrolls as a whole (`grow`) gives such a renderer a height of its own.
 */
function viewClass(grow: boolean | undefined, fills: boolean | undefined): string {
  if (fills) return grow ? 'h-[75vh] min-w-0 px-4 py-4' : 'min-h-0 min-w-0 flex-1 overflow-hidden px-4 py-4'
  return grow ? 'min-w-0 px-4 py-4' : 'min-h-0 min-w-0 flex-1 overflow-auto px-4 py-4'
}
