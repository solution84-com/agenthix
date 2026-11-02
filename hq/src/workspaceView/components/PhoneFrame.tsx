import { useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { ChevronLeft, Folder, GitBranch, MessageSquare, Play } from 'lucide-react'
import { LivePreviewRow } from './LeftPanel'
import { Notice, type FrameParts } from './WorkspaceFrame'

type Tab = 'conversation' | 'preview' | 'files' | 'git'

/**
 * The view on a phone (spec part 1, *Narrow screens*; board `narrow-phone`): one thing at a time, as HQ's mobile
 * layout is. The conversation is the main view; a switch at the bottom moves between *Conversation*, *Live preview*,
 * *Files* and *Git*, with a dot on *Conversation* while the agent works. The branch select is the header's title.
 * The conversation stays mounted while another tab shows, so its thread and unsent text are kept.
 */
export function PhoneFrame(p: FrameParts) {
  const [tab, setTab] = useState<Tab>(p.middleShown ? (p.section === 'git' ? 'git' : 'files') : 'conversation')
  const choose = (t: Tab) => {
    setTab(t)
    if (t === 'files' || t === 'git') p.onSection(t)
  }
  const tabs: { id: Tab; label: string; icon: ReactNode; hidden?: boolean }[] = [
    { id: 'conversation', label: 'Conversation', icon: <MessageSquare size={18} aria-hidden /> },
    { id: 'preview', label: 'Live preview', icon: <Play size={18} aria-hidden />, hidden: !!p.noGit },
    { id: 'files', label: 'Files', icon: <Folder size={18} aria-hidden /> },
    { id: 'git', label: 'Git', icon: <GitBranch size={18} aria-hidden />, hidden: !!p.noGit },
  ]
  const listOrMiddle = p.middleShown ? (
    <div className="flex min-h-0 flex-1 flex-col overflow-auto">{p.middle('narrow')}</div>
  ) : (
    <div className="min-h-0 flex-1 overflow-y-auto">{tab === 'git' ? p.gitBody : p.filesBody}</div>
  )

  return (
    <div className="flex h-dvh w-full flex-col overflow-hidden bg-surface-1 text-text-primary" data-testid="workspace-view" data-size="phone">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border-subtle px-2">
        <Link to={p.back.href} aria-label={`Back to ${p.back.label}`} className="flex h-9 w-9 items-center justify-center rounded-lg text-text-secondary hover:bg-surface-hover">
          <ChevronLeft size={18} aria-hidden />
        </Link>
        <div className="min-w-0 flex-1">
          {p.select(false) ?? <p className="truncate text-body font-semibold">{p.workspaceName}</p>}
        </div>
      </header>
      <Notice text={p.notice} onDismiss={p.onDismissNotice} />
      <div className={tab === 'conversation' ? 'flex min-h-0 flex-1 flex-col' : 'hidden'} data-testid="workspace-conversation">{p.conversation}</div>
      {tab === 'preview' && <div className="p-3"><LivePreviewRow /></div>}
      {(tab === 'files' || tab === 'git') && (
        <>
          {p.noGit && <div className="p-2">{p.noGit}</div>}
          {listOrMiddle}
        </>
      )}
      <nav aria-label="Workspace" className="flex shrink-0 border-t border-border-subtle bg-surface-1">
        {tabs.filter(t => !t.hidden).map(t => (
          <button key={t.id} type="button" aria-pressed={tab === t.id} onClick={() => choose(t.id)}
            className={`relative flex flex-1 flex-col items-center gap-0.5 py-2 text-micro ${tab === t.id ? 'text-accent' : 'text-text-secondary'}`}>
            {t.icon}
            {t.id === 'conversation' && p.activity.working && (
              <span aria-label={`${p.agentName ?? 'The agent'} is working`} className="absolute right-[calc(50%-14px)] top-1.5 h-2 w-2 rounded-full bg-success" />
            )}
            {t.label}
          </button>
        ))}
      </nav>
    </div>
  )
}
