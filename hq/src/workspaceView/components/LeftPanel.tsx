import type { ReactNode } from 'react'
import { ChevronDown, ChevronRight, Folder, GitBranch, Play } from 'lucide-react'
import type { LivePreviewStateName } from '@agenthix/core'
import type { ViewSection } from '../viewAddress'
import { PREVIEW_STATE_LABEL } from '../livePreviewWords'

/**
 * The left panel (spec part 1, *Layout* 2–4): the branch select, then *Live preview* with its state, then *Files* and
 * *Git* as an accordion, one open at a time. Choosing *Live preview* shows it in the middle. Without Git, *Live
 * preview* and *Git* offer *Turn Git on* instead.
 */
export function LeftPanel({ branchSelect, section, onSection, filesNote, gitNote, files, git, noGit, previewState }: {
  branchSelect: ReactNode
  section: ViewSection
  onSection: (section: ViewSection) => void
  /** Beside the accordion's titles: "4 changed", "6 ahead", "14 versions". */
  filesNote: string
  gitNote: string
  files: ReactNode
  git: ReactNode
  /** The workspace has no Git: what stands where *Live preview* and *Git* would be. */
  noGit?: ReactNode
  previewState: LivePreviewStateName
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 p-2" data-testid="workspace-left">
      {branchSelect}
      {noGit ?? <LivePreviewRow state={previewState} chosen={section === 'preview'} onChoose={() => onSection('preview')} />}
      <div className="flex min-h-0 flex-1 flex-col border-t border-border-subtle">
        <Fold title="Files" icon={<Folder size={15} aria-hidden />} note={filesNote} open={section === 'files'} onOpen={() => onSection('files')}>{files}</Fold>
        {!noGit && <Fold title="Git" icon={<GitBranch size={15} aria-hidden />} note={gitNote} open={section === 'git'} onOpen={() => onSection('git')}>{git}</Fold>}
      </div>
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

function Fold({ title, icon, note, open, onOpen, children }: {
  title: string
  icon: ReactNode
  note: string
  open: boolean
  onOpen: () => void
  children: ReactNode
}) {
  return (
    <section aria-label={title} className={`flex flex-col border-b border-border-subtle ${open ? 'min-h-0 flex-1' : ''}`}>
      <h2>
        <button type="button" aria-expanded={open} onClick={onOpen}
          className="flex w-full items-center gap-1.5 px-1 py-1.5 text-left text-small font-semibold text-text-primary hover:bg-surface-hover">
          {open ? <ChevronDown size={14} aria-hidden className="text-text-muted" /> : <ChevronRight size={14} aria-hidden className="text-text-muted" />}
          <span className="text-text-muted">{icon}</span>{title}
          <span className="ml-auto text-micro font-normal text-text-muted">{note}</span>
        </button>
      </h2>
      {open && <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>}
    </section>
  )
}

/** The panel folded to its strip (about 900–1280 px wide): the branch, *Live preview*, *Files* and *Git* as icons. */
export function LeftStrip({ branchSelect, section, open, onChoose, git, previewState }: {
  branchSelect: ReactNode
  section: ViewSection
  /** Files or Git open over the middle. */
  open: boolean
  onChoose: (section: ViewSection) => void
  git: boolean
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
      {git && icon('preview', `Live preview · ${PREVIEW_STATE_LABEL[previewState]}`, (
        <>
          <Play size={16} aria-hidden />
          <span aria-hidden className={`absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full ${STATE_DOT[previewState]}`} />
        </>
      ))}
      {icon('files', 'Files', <Folder size={16} aria-hidden />)}
      {git && icon('git', 'Git', <GitBranch size={16} aria-hidden />)}
    </nav>
  )
}
