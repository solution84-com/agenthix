import type { ReactNode } from 'react'
import { CONTROL_HEIGHT, FOCUS_RING } from '../primitives/controlStyles'
import { ChevronLeftGlyph, DownloadGlyph, MaximizeGlyph, PanelLeftGlyph, XGlyph } from '../primitives/Glyphs'
import { Tooltip } from '../primitives/Tooltip'
import { OverflowMenu, type OverflowItem } from '../tasks/OverflowMenu'
import { SAFE_LINK } from './FileFrameParts'

// The icons are drawn inline (`Glyphs`), as every primitive's are: hq's tests resolve lucide from hq.

/** An icon-only control in the frame's header: the same size and outline as ⋯ beside it, 36 px, 44 px on a phone. */
export const FRAME_ICON_BUTTON =
  `inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-1 text-text-secondary hover:bg-surface-hover disabled:opacity-40 disabled:hover:bg-surface-1 max-sm:h-11 max-sm:w-11 ${FOCUS_RING}`

const BACK_BUTTON =
  `${CONTROL_HEIGHT} inline-flex min-w-0 max-w-[50%] shrink-0 items-center gap-0.5 rounded-lg pl-1 pr-2 text-small font-medium text-accent hover:bg-surface-hover ${FOCUS_RING}`

// Wide, Download keeps its word beside the icon; in a narrow frame it is the icon alone, named by its tooltip.
const DOWNLOAD_BUTTON =
  `${CONTROL_HEIGHT} inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg border border-border bg-surface-1 px-3 text-small font-medium text-text-primary hover:bg-surface-hover disabled:opacity-40 disabled:hover:bg-surface-1 @max-lg:w-9 @max-lg:px-0 max-sm:@max-lg:w-11 ${FOCUS_RING}`

/** Download through the relay, in the header: a link styled as a button, or the button greyed when no byte can be fetched. */
function HeaderDownload({ link }: { link?: string }) {
  const inner = <><DownloadGlyph /><span className="@max-lg:sr-only">Download</span></>
  if (!link || !SAFE_LINK.test(link)) {
    return <button type="button" className={DOWNLOAD_BUTTON} disabled aria-label="Download">{inner}</button>
  }
  return (
    <Tooltip label="Download" side="bottom">
      <a href={link} aria-label="Download" className={DOWNLOAD_BUTTON}>{inner}</a>
    </Tooltip>
  )
}

function IconButton({ label, onClick, pressed, children, className = '' }: {
  label: string
  onClick: () => void
  pressed?: boolean
  children: ReactNode
  className?: string
}) {
  return (
    <Tooltip label={label} side="bottom">
      <button
        type="button" aria-label={label} aria-pressed={pressed} onClick={onClick}
        className={`${FRAME_ICON_BUTTON} ${pressed ? '!bg-selected text-text-primary' : ''} ${className}`}
      >
        {children}
      </button>
    </Tooltip>
  )
}

/** A word after an action ("Link copied."), under the actions and over the content, never in its layout; the caller clears it. */
function ActionNotice({ text }: { text?: string }) {
  if (!text) return null
  return (
    <p role="status" className="absolute right-0 top-full z-20 mt-1 w-max max-w-72 rounded-lg border border-border bg-surface-1 px-3 py-2 text-small text-text-primary shadow-pop">
      {text}
    </p>
  )
}

export interface FrameHeaderProps {
  title: string
  /** Where it lives, above the title: ["Files", "reports"]. */
  breadcrumb?: readonly string[]
  /** "‹ QR-1": back to where the person came from. */
  back?: { label: string; onBack: () => void }
  /** The folder beside the file (the Files tool): ▤, its fill showing while the folder is shown. */
  folderToggle?: { shown: boolean; onToggle: () => void }
  /** Undefined greys Download; null leaves it out (a file that could not be opened). */
  downloadLink?: string | null
  onFullScreen?: () => void
  menu?: OverflowItem[]
  /** ✕: closing returns to the same page (full screen back to the viewer). */
  onClose?: () => void
  /** The caller's words after an action, shown until it clears them: "Link copied." */
  notice?: string
}

/**
 * The one header of a file wherever it opens (the file viewer's *One header everywhere*): ‹ back, named for where the
 * person came from; the file's folder and name; Download, Full screen and ⋯; ✕ where closing stays on the page. In a
 * narrow frame the name has a line of its own under the controls, so it is never cut to a few letters.
 */
export function FrameHeader(p: FrameHeaderProps) {
  const where = p.breadcrumb && p.breadcrumb.length > 0 ? p.breadcrumb.join(' › ') : null
  return (
    <div className="@container shrink-0 border-b border-border-subtle px-4 py-2 max-sm:px-3" data-testid="file-frame-header">
      <div className="flex items-center gap-2 @max-lg:flex-wrap">
        {p.back && (
          <button type="button" onClick={p.back.onBack} className={BACK_BUTTON}>
            <ChevronLeftGlyph size={16} className="shrink-0" />
            <span className="truncate">{p.back.label}</span>
          </button>
        )}
        {p.folderToggle && (
          <IconButton
            label={p.folderToggle.shown ? 'Hide the folder' : 'Show the folder'}
            pressed={p.folderToggle.shown} onClick={p.folderToggle.onToggle}
          >
            <PanelLeftGlyph />
          </IconButton>
        )}
        <div className="min-w-0 flex-1 @max-lg:order-last @max-lg:basis-full">
          {where && <nav aria-label="Breadcrumb" className="truncate text-small text-text-muted" data-testid="file-frame-folder">{where}</nav>}
          <h3 className="truncate text-h3 font-semibold text-text-primary">{p.title}</h3>
        </div>
        <div className="relative ml-auto flex shrink-0 items-center gap-2">
          {p.downloadLink !== null && <HeaderDownload link={p.downloadLink} />}
          {p.onFullScreen && (
            <IconButton label="Full screen" onClick={p.onFullScreen} className="max-sm:hidden">
              <MaximizeGlyph />
            </IconButton>
          )}
          {p.menu && <OverflowMenu items={p.menu} />}
          {p.onClose && (
            <IconButton label="Close" onClick={p.onClose}>
              <XGlyph />
            </IconButton>
          )}
          <ActionNotice text={p.notice} />
        </div>
      </div>
    </div>
  )
}
