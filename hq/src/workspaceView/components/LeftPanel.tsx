import type { ReactNode } from 'react'
import { Folder, Play } from 'lucide-react'
import type { LivePreviewStateName } from '@agenthix/core'
import type { ViewSection } from '../viewAddress'
import { PREVIEW_STATE_LABEL } from '../livePreviewWords'

/**
 * The left panel (board *Files and changes, one view*): the branch select while it is still here, *Live preview* with
 * its state, then the one file tree (`files`, with *Open a file…* and *Only changed*), filling the rest. Without Git,
 * what stands where *Live preview* would be (`noGit`). There is no Git section: a branch's changes are marked in the
 * tree, and its details are in the branch's menu. `section`, `onSection`, the notes and `git` are kept for the frame
 * that still passes them, and `git` is not shown.
 */
export function LeftPanel({ branchSelect, section, onSection, files, noGit, preview = true, previewState }: {
  branchSelect: ReactNode
  section: ViewSection
  onSection: (section: ViewSection) => void
  filesNote?: string
  gitNote?: string
  files: ReactNode
  git?: ReactNode
  /** The workspace has no Git: what stands where *Live preview* would be. */
  noGit?: ReactNode
  /** Whether *Live preview* is shown: not while its flag is off. */
  preview?: boolean
  previewState: LivePreviewStateName
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 p-2" data-testid="workspace-left">
      {branchSelect}
      {noGit ?? (preview && <LivePreviewRow state={previewState} chosen={section === 'preview'} onChoose={() => onSection('preview')} />)}
      <section aria-label="Files" className="-mx-2 flex min-h-0 flex-1 flex-col border-t border-border-subtle">{files}</section>
    </div>
  )
}

const STATE_DOT: Record<LivePreviewStateName, string> = {
  running: 'bg-success', starting: 'bg-warning', paused: 'bg-warning', stopped: 'bg-text-muted',
}

/** *Live preview* with its state (*Running*, *Starting*, *Paused*, *Stopped*), always first in the panel. */
export function LivePreviewRow({ state, chosen, onChoose }: { state: LivePreviewStateName; chosen: boolean; onChoose: () => void }) {
  return (
    <button type="button" aria-pressed={chosen} onClick={onChoose} data-testid="live-preview-row"
      className={`flex w-full items-center gap-2 rounded-lg border px-2 py-1.5 text-left text-small font-medium text-text-primary hover:bg-surface-hover ${chosen ? 'border-accent bg-accent-subtle' : 'border-border-subtle'}`}>
      <Play size={14} aria-hidden className="text-text-muted" /> Live preview
      <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-surface-2 px-2 py-0.5 text-micro text-text-secondary">
        <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${STATE_DOT[state]}`} /> {PREVIEW_STATE_LABEL[state]}
      </span>
    </button>
  )
}

/** The panel folded to its strip while *Live preview* shows: the branch, *Live preview* and *Files* as icons. */
export function LeftStrip({ branchSelect, section, open, onChoose, git, preview = true, previewState }: {
  branchSelect: ReactNode
  section: ViewSection
  /** Files open over the middle. */
  open: boolean
  onChoose: (section: ViewSection) => void
  git: boolean
  /** Whether *Live preview* is shown: not while its flag is off. */
  preview?: boolean
  previewState: LivePreviewStateName
}) {
  const on = (s: ViewSection) => (s === 'preview' ? section === 'preview' : open && section === s)
  const icon = (s: ViewSection, label: string, node: ReactNode) => (
    <button type="button" aria-label={label} title={label} aria-pressed={on(s)} onClick={() => onChoose(s)}
      className={`relative flex h-9 w-9 items-center justify-center rounded-lg hover:bg-surface-hover ${on(s) ? 'bg-accent-subtle text-accent' : 'text-text-secondary'}`}>
      {node}
    </button>
  )
  return (
    <nav aria-label="Workspace" className="flex w-12 shrink-0 flex-col items-center gap-1 border-r border-border-subtle py-2" data-testid="workspace-strip">
      {branchSelect}
      <span className="my-1 h-px w-6 bg-border-subtle" aria-hidden />
      {git && preview && icon('preview', `Live preview · ${PREVIEW_STATE_LABEL[previewState]}`, (
        <>
          <Play size={16} aria-hidden />
          {/* The dot means a live preview runs; its other states are in the label. */}
          {previewState === 'running' && (
            <span aria-hidden data-testid="strip-preview-dot" className={`absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full ${STATE_DOT.running}`} />
          )}
        </>
      ))}
      {icon('files', 'Files', <Folder size={16} aria-hidden />)}
    </nav>
  )
}
