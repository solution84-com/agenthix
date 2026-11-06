import type { ReactNode } from 'react'
import { X } from 'lucide-react'
import type { LivePreviewStateName } from '@agenthix/core'
import { useViewSize } from '../hooks/useViewSize'
import type { ViewSection } from '../viewAddress'
import { LeftStrip } from './LeftPanel'
import { PhoneFrame } from './PhoneFrame'
import { TopBar, type SwitcherItem } from './TopBar'
import type { ViewTopParts } from './ViewTop'

export interface FrameParts {
  back: { href: string; label: string }
  workspaceName: string
  workspaces: readonly SwitcherItem[]
  section: ViewSection
  onSection: (section: ViewSection) => void
  /** The left panel: the file tree with the branch's changes marked. */
  left: ReactNode
  /** The same list, full width, as a phone shows it. */
  filesBody: ReactNode
  git: boolean
  middle: (layout: 'wide' | 'narrow') => ReactNode
  /** A file or a file's changes is chosen. */
  middleShown: boolean
  /** The chosen branch's live preview, shown in the middle when *Live preview* is chosen; none while its flag is off. */
  preview?: (layout: 'wide' | 'narrow') => ReactNode
  previewState: LivePreviewStateName
  /** The branch's agent is working on it now, by name; null when none is. */
  working: string | null
  top: ViewTopParts
  notice: string | null
  onDismissNotice: () => void
}

/**
 * The view's own frame, between the app's rail and its chat panel (which the app frame draws on the right, full height,
 * and which browsing never moves): the top bar, then the left panel and the middle. The panel keeps its labels at
 * every width but a phone's, where `PhoneFrame` shows one thing at a time. While a live preview shows, the panel
 * narrows to its strip, as it always has.
 */
export function WorkspaceFrame(p: FrameParts) {
  const size = useViewSize()
  if (size === 'phone') return <PhoneFrame {...p} />
  const previewShown = p.section === 'preview' && p.git && !!p.preview

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col overflow-hidden bg-surface-0 text-text-primary" data-testid="workspace-view" data-size={size}>
      <TopBar backHref={p.back.href} backLabel={p.back.label} workspaceName={p.workspaceName} workspaces={p.workspaces}
        crumbs={p.top.crumbs} next={p.top.next} onAbout={p.top.onAbout} />
      {p.top.note}
      <div className="relative flex min-h-0 flex-1">
        {previewShown ? (
          <LeftStrip branchSelect={null} section={p.section} open={false} onChoose={p.onSection} git={p.git} preview={!!p.preview} previewState={p.previewState} />
        ) : (
          <aside aria-label="Files" className="flex w-[290px] shrink-0 flex-col border-r border-border-subtle bg-surface-1">{p.left}</aside>
        )}
        <main className="flex min-h-0 min-w-0 flex-1 flex-col bg-surface-1">
          <Notice text={p.notice} onDismiss={p.onDismissNotice} />
          {previewShown ? p.preview?.('wide') : <div className="flex min-h-0 flex-1 flex-col overflow-auto">{p.middle('wide')}</div>}
        </main>
      </div>
      {p.top.dialogs}
    </div>
  )
}

export function Notice({ text, onDismiss }: { text: string | null; onDismiss: () => void }) {
  if (!text) return null
  return (
    <div role="status" className="flex shrink-0 items-start gap-2 border-b border-border-subtle bg-accent-subtle px-4 py-2 text-small text-text-primary">
      <p className="flex-1">{text}</p>
      <button type="button" aria-label="Dismiss" onClick={onDismiss} className="text-text-muted hover:text-text-primary"><X size={14} aria-hidden /></button>
    </div>
  )
}
