import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { ChevronDown, ChevronLeft, FolderOpen, PanelRightClose, PanelRightOpen } from 'lucide-react'
import { workspaceViewPath } from '../viewAddress'

export interface SwitcherItem { id: string; name: string }

/**
 * The view's top bar (spec part 1, *Layout* 1): *‹ <project>* back to the place, then the workspace switcher, the
 * place's workspaces most recently opened first. On the right, `right` (the agent's button on a narrow window) and
 * the button that hides or shows the conversation.
 */
export function TopBar({ backHref, backLabel, workspaceName, workspaces, aboutHref, right, conversationShown, onToggleConversation }: {
  backHref: string
  /** The workspace's About in its place: its facts, runs, secrets, GitHub and Delete. */
  aboutHref: string
  backLabel: string
  workspaceName: string
  workspaces: readonly SwitcherItem[]
  right?: ReactNode
  conversationShown?: boolean
  onToggleConversation?: () => void
}) {
  return (
    <header className="flex h-11 shrink-0 items-center gap-2 border-b border-border-subtle bg-surface-1 px-3" data-testid="workspace-top">
      <Link to={backHref} className="flex min-w-0 items-center gap-1 text-small font-medium text-text-secondary hover:text-text-primary">
        <ChevronLeft size={15} aria-hidden /><span className="truncate">{backLabel}</span>
      </Link>
      <span className="text-text-muted" aria-hidden>/</span>
      <Switcher name={workspaceName} workspaces={workspaces} />
      <span className="ml-auto flex items-center gap-1">
        {right}
        <Link to={aboutHref} className="rounded-lg px-2 py-1 text-small text-text-secondary hover:bg-surface-hover hover:text-text-primary">About</Link>
        {onToggleConversation && (
          <button type="button" onClick={onToggleConversation}
            aria-label={conversationShown ? 'Hide the conversation' : 'Show the conversation'} title={conversationShown ? 'Hide the conversation' : 'Show the conversation'}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-text-secondary hover:bg-surface-hover">
            {conversationShown ? <PanelRightClose size={17} aria-hidden /> : <PanelRightOpen size={17} aria-hidden />}
          </button>
        )}
      </span>
    </header>
  )
}

function Switcher({ name, workspaces }: { name: string; workspaces: readonly SwitcherItem[] }) {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [open])
  return (
    <div ref={box} className="relative min-w-0">
      <button type="button" aria-haspopup="menu" aria-expanded={open} aria-label={`Workspace: ${name}`} onClick={() => setOpen(o => !o)}
        className="flex min-w-0 items-center gap-1 rounded-lg px-1.5 py-1 text-small font-semibold text-text-primary hover:bg-surface-hover">
        <FolderOpen size={15} aria-hidden className="shrink-0 text-text-muted" /><span className="truncate">{name}</span>
        <ChevronDown size={14} aria-hidden className="shrink-0 text-text-muted" />
      </button>
      {open && (
        <ul role="menu" aria-label="Workspaces" className="absolute left-0 z-40 mt-1 max-h-80 w-64 overflow-y-auto rounded-xl border border-border bg-surface-1 p-1 shadow-xl">
          {workspaces.map(w => (
            <li key={w.id} role="none">
              <Link role="menuitem" to={workspaceViewPath(w.id)} onClick={() => setOpen(false)} aria-current={w.name === name ? 'true' : undefined}
                className={`block truncate rounded-lg px-2 py-1.5 text-small hover:bg-surface-hover ${w.name === name ? 'bg-accent-subtle text-text-primary' : 'text-text-secondary'}`}>
                {w.name}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
