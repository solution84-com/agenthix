import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { FileFrame, type FileFrameProps } from '@agenthix/ui/files'
import { FILES_BUTTON, FilesViewHeader } from '@agenthix/ui/projects'
import { placePathOf, stableLinkOf } from './fileReferences'

/**
 * A file's stable link (spec part 3, *Stable links*): the place's address — `base`, or this page's without a
 * conversation — with only the parameters that name the file, never a site, a relay or a ticket.
 */
export function stableLink(names: Record<string, string | null>, base?: string): string {
  return stableLinkOf(window.location.origin, base ?? placePathOf(window.location.pathname), names)
}

/** The same frame and renderer filling the window; ‹ Close or Escape puts it back in the tool. */
export function FullScreenFile({ frame, onClose }: { frame: FileFrameProps; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])
  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={frame.name} className="fixed inset-0 z-50 overflow-y-auto bg-surface-1">
      <FileFrame {...frame} layout="narrow" back={{ label: 'Close', onBack: onClose }} />
    </div>,
    document.body,
  )
}

/** HQ refused to open it, or could not be reached: its words, and Try again. */
export function OpenFailed({ name, error, layout, backLabel, onBack, onRetry }: {
  name: string
  error: Error
  layout: 'narrow' | 'wide'
  backLabel: string
  onBack: () => void
  onRetry: () => void
}) {
  return (
    <>
      {layout === 'narrow' ? (
        <FilesViewHeader back={backLabel} onBack={onBack} title={name} />
      ) : (
        <div className="border-b border-border-subtle px-4 py-2">
          <h3 className="truncate text-h3 font-semibold text-text-primary">{name}</h3>
        </div>
      )}
      <div role="alert" className="flex flex-col items-start gap-3 px-4 py-6 text-body text-text-secondary">
        <p>{error.message}</p>
        <button type="button" className={FILES_BUTTON} onClick={onRetry}>Try again</button>
      </div>
    </>
  )
}

/** A file opened from a link or a message that is not there any more: its name kept, and the folder it was in. */
export function FileGone({ name, folder, layout, backLabel, onBack, onOpenFolder }: {
  name: string
  /** Where it was: ["Files", "reports"]. */
  folder: readonly string[]
  layout: 'narrow' | 'wide'
  backLabel: string
  onBack: () => void
  onOpenFolder: () => void
}) {
  const where = folder.join(' › ')
  return (
    <>
      {layout === 'narrow' ? (
        <FilesViewHeader back={backLabel} onBack={onBack} title={name} />
      ) : (
        <div className="border-b border-border-subtle px-4 py-2">
          <h3 className="truncate text-h3 font-semibold text-text-muted line-through">{name}</h3>
        </div>
      )}
      <div role="status" className="flex flex-col items-start gap-3 px-4 py-6 text-body text-text-secondary">
        <p>This file isn&apos;t here any more.{where && ` It was in ${where}.`}</p>
        {where && <button type="button" className={FILES_BUTTON} onClick={onOpenFolder}>Open {folder[folder.length - 1]}</button>}
      </div>
    </>
  )
}
