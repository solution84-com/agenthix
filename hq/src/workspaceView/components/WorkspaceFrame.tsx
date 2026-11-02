import { useEffect, useState, type ReactNode } from 'react'
import { X } from 'lucide-react'
import type { LivePreviewStateName } from '@agenthix/core'
import type { ThreadActivity } from '../../conversations/components/ConversationThread'
import { useViewSize } from '../hooks/useViewSize'
import type { ViewSection } from '../viewAddress'
import { LeftPanel, LeftStrip } from './LeftPanel'
import { PhoneFrame } from './PhoneFrame'
import { TopBar, type SwitcherItem } from './TopBar'

export interface FrameParts {
  back: { href: string; label: string }
  aboutHref: string
  workspaceName: string
  workspaces: readonly SwitcherItem[]
  section: ViewSection
  onSection: (section: ViewSection) => void
  /** The branch select, full or as the strip's icon. */
  select: (compact: boolean) => ReactNode
  filesBody: ReactNode
  gitBody: ReactNode
  filesNote: string
  gitNote: string
  noGit?: ReactNode
  middle: (layout: 'wide' | 'narrow') => ReactNode
  /** A file or a file's changes is chosen. */
  middleShown: boolean
  /** The chosen branch's live preview, shown in the middle when *Live preview* is chosen. */
  preview: (layout: 'wide' | 'narrow') => ReactNode
  previewState: LivePreviewStateName
  status: ReactNode
  conversation: ReactNode
  branchTitle: string
  activity: ThreadActivity
  agentName: string | null
  notice: string | null
  onDismissNotice: () => void
}

/**
 * Lays the view out for the window (spec part 1, *Narrow screens*): wide, the panel, the middle and the conversation
 * side by side; on a laptop the panel folds to its strip and *Files* or *Git* opens over the middle; on a tablet the
 * conversation becomes a drawer from the right, opened from the top bar, below the live preview's own bar; on a phone,
 * one thing at a time. Choosing *Live preview* narrows the left panel to its strip at every width.
 */
export function WorkspaceFrame(p: FrameParts) {
  const size = useViewSize()
  const [conversationShown, setConversationShown] = useState(true)
  const [drawer, setDrawer] = useState(false)
  const [over, setOver] = useState(false)
  // Escape closes Files or Git open over the middle.
  useEffect(() => {
    if (!over) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOver(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [over])
  if (size === 'phone') return <PhoneFrame {...p} />

  const previewShown = p.section === 'preview' && !p.noGit
  const strip = size !== 'wide' || previewShown
  // One thing over the middle at a time: the panel or the conversation's drawer.
  const chooseFromStrip = (s: ViewSection) => {
    // Live preview shows in the middle, and on a wide window Files and Git open the whole panel again.
    if (s === 'preview' || size === 'wide') { setOver(false); p.onSection(s); return }
    if (s === p.section && over) { setOver(false); return }
    if (s !== p.section) p.onSection(s)
    setOver(true)
    setDrawer(false)
  }
  const toggleDrawer = () => {
    setDrawer(d => !d)
    setOver(false)
  }
  const agentButton = size === 'tablet' && (
    <button type="button" aria-expanded={drawer} onClick={toggleDrawer}
      className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-small ${drawer ? 'border-accent bg-accent-subtle' : 'border-border'} text-text-primary hover:bg-surface-hover`}>
      {p.activity.working && <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-success" />}
      {p.activity.working ? `${p.agentName ?? 'The agent'} is working` : 'Conversation'}
    </button>
  )

  return (
    <div className="flex h-screen w-full flex-col overflow-hidden bg-surface-0 text-text-primary" data-testid="workspace-view" data-size={size}>
      <TopBar {...topBarParts(p)} right={agentButton}
        conversationShown={size === 'tablet' ? undefined : conversationShown}
        onToggleConversation={size === 'tablet' ? undefined : () => setConversationShown(s => !s)} />
      <div className="relative flex min-h-0 flex-1">
        {strip ? (
          <LeftStrip branchSelect={p.select(true)} section={p.section} open={over} onChoose={chooseFromStrip} git={!p.noGit} previewState={p.previewState} />
        ) : (
          <aside aria-label="Branch, files and Git" className="flex w-[290px] shrink-0 flex-col border-r border-border-subtle bg-surface-1">
            <LeftPanel branchSelect={p.select(false)} section={p.section} onSection={p.onSection} filesNote={p.filesNote} gitNote={p.gitNote}
              files={p.filesBody} git={p.gitBody} noGit={p.noGit} previewState={p.previewState} />
          </aside>
        )}
        {strip && over && !previewShown && (
          <aside aria-label={p.section === 'git' ? 'Git' : 'Files'} data-testid="workspace-over"
            className="absolute bottom-0 left-12 top-0 z-30 flex w-[300px] flex-col overflow-y-auto border-r border-border bg-surface-1 shadow-xl">
            {p.noGit && <div className="p-2">{p.noGit}</div>}
            {p.section === 'git' ? p.gitBody : p.filesBody}
          </aside>
        )}
        <main onMouseDown={() => setOver(false)} className="flex min-h-0 min-w-0 flex-1 flex-col bg-surface-1">
          <Notice text={p.notice} onDismiss={p.onDismissNotice} />
          {previewShown ? p.preview('wide') : <div className="flex min-h-0 flex-1 flex-col overflow-auto">{p.middle('wide')}</div>}
          {p.status}
        </main>
        {size === 'tablet' ? (
          <aside aria-label="Conversation" data-testid="workspace-conversation"
            className={`${drawer ? 'flex' : 'hidden'} absolute bottom-0 right-0 ${previewShown ? 'top-11' : 'top-0'} z-30 w-[min(400px,90vw)] flex-col border-l border-border bg-surface-1 shadow-xl`}>
            {p.conversation}
          </aside>
        ) : (
          <aside aria-label="Conversation" data-testid="workspace-conversation"
            className={`${conversationShown ? 'flex' : 'hidden'} min-h-0 shrink-0 flex-col border-l border-border-subtle bg-surface-1 ${size === 'wide' ? 'w-[380px]' : 'w-[340px]'}`}>
            {p.conversation}
          </aside>
        )}
      </div>
    </div>
  )
}

export function topBarParts(p: FrameParts) {
  return { backHref: p.back.href, backLabel: p.back.label, workspaceName: p.workspaceName, workspaces: p.workspaces, aboutHref: p.aboutHref }
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
