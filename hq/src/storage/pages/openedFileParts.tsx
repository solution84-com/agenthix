import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { FileFrame, FrameHeader, type FileFrameProps } from '@agenthix/ui/files'
import { FILES_BUTTON } from '@agenthix/ui/projects'
import { placePathOf, stableLinkOf } from './fileReferences'
import { ShowAttention } from '@agenthix/ui/attention'

/**
 * A file's stable link (spec part 3, *Stable links*): the place's address — `base`, or this page's without a
 * conversation — with only the parameters that name the file, never a site, a relay or a ticket.
 */
export function stableLink(names: Record<string, string | null>, base?: string): string {
  return stableLinkOf(window.location.origin, base ?? placePathOf(window.location.pathname), names)
}

/**
 * The same frame and renderer filling the window, over the menu and the chat too (C1): its own header, with
 * "‹ Back to the viewer" and ✕, the title, Download and ⋯. Either, or Escape, puts it back.
 */
export function FullScreenFile({ frame, onClose }: { frame: FileFrameProps; onClose: () => void }) {
  useEffect(() => {
    // A menu open inside it takes the key: Escape closes the menu, and the next one closes full screen.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || document.querySelector('[aria-haspopup="menu"][aria-expanded="true"]')) return
      onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])
  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={frame.title ?? frame.name} className="fixed inset-0 z-50 flex flex-col bg-surface-1">
      <FileFrame {...frame} back={{ label: 'Back to the viewer', onBack: onClose }} onClose={onClose} onFullScreen={undefined} />
    </div>,
    document.body,
  )
}

/** HQ refused to open it, or could not be reached: its words, and Try again, under the same header. */
export function OpenFailed({ name, error, back, onRetry }: {
  name: string
  error: Error
  back?: { label: string; onBack: () => void }
  onRetry: () => void
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <FrameHeader title={name} back={back} downloadLink={null} />
      <ShowAttention title="The file could not be opened" text={error.message} retry={onRetry} />
    </div>
  )
}

/** What a file that isn't there says, and the one thing to do about it. */
export interface NotThere {
  words: string
  action?: { label: string; onAction: () => void }
}

/**
 * A file that isn't there: one that was listed and has gone ("isn't here any more", with the folder it was in), or a
 * path that names nothing, said as such (S18). Its name is kept, under the same header as any file.
 */
export function FileNotThere({ name, breadcrumb, back, notThere }: {
  name: string
  breadcrumb: readonly string[]
  back?: { label: string; onBack: () => void }
  notThere: NotThere
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="file-not-there">
      <FrameHeader title={name} breadcrumb={breadcrumb} back={back} downloadLink={null} />
      <div role="status" className="flex flex-col items-start gap-3 px-4 py-6 text-body text-text-secondary">
        <p>{notThere.words}</p>
        {notThere.action && (
          <button type="button" className={FILES_BUTTON} onClick={notThere.action.onAction}>{notThere.action.label}</button>
        )}
      </div>
    </div>
  )
}
