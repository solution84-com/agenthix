import { useCallback, useState, type ReactNode } from 'react'
import { X } from 'lucide-react'
import type { FileOpenAnswer, RendererMode, RendererReport } from '@agenthix/core'
import { FILES_BUTTON } from '../projects/FilesToolParts'
import { OverflowMenu, type OverflowItem } from '../tasks/OverflowMenu'
import { DownloadButton, EmbeddedCard, FrameHeader, FrameLoading, FrameNoticePanel } from './FileFrameParts'
import {
  canDownload, factsLine, noticeOfReport, partialWords, viewOfAnswer, type FrameStateId, type FrameView,
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
  /** Narrow: the file alone, with ‹ back in the panel's header row. Wide: beside the folders. */
  layout?: 'narrow' | 'wide'
  back?: { label: string; onBack: () => void }
  /** Opened fills its area inside the frame; embedded sits in a page or a message, with no controls. */
  mode?: RendererMode
  /**
   * By default an opened file fills the space its container gives the frame, and the file scrolls inside it, so the
   * header, facts line and actions stay in place. `grow` lets the frame take the height of its file instead, for a
   * caller whose page scrolls as a whole.
   */
  grow?: boolean
  registry?: RendererRegistry
  /** The caller's words after an action: "Path copied." */
  notice?: string
  onMention?: () => void
  onCopyLink?: () => void
  onCopyPath?: () => void
  onFullScreen?: () => void
  /** Wide layout: a close button in the header row (narrow has its back arrow). */
  onClose?: () => void
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
  if (props.onFullScreen) items.push({ label: 'Open full screen', onSelect: props.onFullScreen })
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
  const notice = view.phase === 'notice' ? view.notice : view.phase === 'render' ? noticeOfReport(report, view.facts) : null
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

  const actions = (
    <>
      {props.onMention && <button type="button" className={FILES_BUTTON} onClick={props.onMention}>Mention</button>}
      <DownloadButton link={downloadLink} />
      <OverflowMenu items={menuItems(props)} />
      {props.onClose && (props.layout ?? 'wide') === 'wide' && (
        <button type="button" aria-label="Close" className={FILES_BUTTON} onClick={props.onClose}>
          <X size={13} aria-hidden />
        </button>
      )}
    </>
  )
  const partial = view.phase === 'render' && !notice ? partialWords(report, view.facts) : null

  return (
    <div className={props.grow ? 'min-w-0' : 'flex h-full min-h-0 min-w-0 flex-1 flex-col'} data-testid="file-frame">
      <FrameHeader title={title} breadcrumb={props.breadcrumb} layout={props.layout ?? 'wide'} back={props.back} actions={actions} />
      {(line || props.notice) && (
        <p role="status" className="px-4 pt-3 text-small text-text-muted">{[line, props.notice].filter(Boolean).join(' · ')}</p>
      )}
      {view.phase === 'opening' && <FrameLoading />}
      {notice && (
        <FrameNoticePanel notice={notice} downloadLink={downloadLink} onRetry={props.onReopen} hint={props.adminHint?.(notice.state)} />
      )}
      {partial && (
        <p className="flex flex-wrap items-center gap-2 px-4 pt-3 text-small text-text-secondary">
          {partial} <DownloadButton link={downloadLink} quiet />
        </p>
      )}
      {renderer && (
        <div className={props.grow ? 'min-w-0 px-4 py-4' : 'min-h-0 min-w-0 flex-1 overflow-auto px-4 py-4'} data-testid="file-frame-view">
          {renderer}
        </div>
      )}
    </div>
  )
}
