import { Fragment, type ReactNode } from 'react'
import { Link } from 'react-router'
import { ChevronLeft, FolderOpen } from 'lucide-react'
import { workspaceViewPath } from '../viewAddress'
import { Dropdown } from './Dropdown'
import { ROW_CHOSEN, ROW_ITEM, DISABLED, FOCUS_RING } from '@agenthix/ui/primitives'

export interface SwitcherItem { id: string; name: string }

/**
 * The view's top bar: the breadcrumb says where the person is, *‹ <place>* back to the place, the workspace ▾ (the
 * place's workspaces, the most recently opened first), then `crumbs` (the branch ▾, and 💬 Chat or main's version).
 * On the right the one next step, then About.
 */
export function TopBar({ backHref, backLabel, workspaceName, workspaces, crumbs, next, onAbout }: {
  backHref: string
  backLabel: string
  workspaceName: string
  workspaces: readonly SwitcherItem[]
  crumbs: readonly ReactNode[]
  next: ReactNode
  onAbout: () => void
}) {
  return (
    <header className="flex h-11 shrink-0 items-center gap-1.5 border-b border-border-subtle bg-surface-1 px-3" data-testid="workspace-top">
      <nav aria-label="Where you are" className="flex min-w-0 flex-1 items-center gap-1">
        <Link to={backHref} className="flex min-w-0 shrink items-center gap-1 text-small font-medium text-text-secondary hover:text-text-primary">
          <ChevronLeft size={15} aria-hidden /><span className="truncate">{backLabel}</span>
        </Link>
        <span className="text-text-muted" aria-hidden>/</span>
        <Switcher name={workspaceName} workspaces={workspaces} />
        {crumbs.map((c, i) => <Fragment key={i}><span className="text-text-muted" aria-hidden>/</span>{c}</Fragment>)}
      </nav>
      <span className="flex shrink-0 items-center gap-1.5">
        {next}
        <button type="button" onClick={onAbout} className={`rounded-lg px-2 py-1 text-small text-text-secondary not-disabled:hover:bg-surface-hover not-disabled:hover:text-text-primary not-disabled:active:bg-surface-pressed ${FOCUS_RING} ${DISABLED}`}>About</button>
      </span>
    </header>
  )
}

function Switcher({ name, workspaces }: { name: string; workspaces: readonly SwitcherItem[] }) {
  return (
    <Dropdown label={`Workspace: ${name}`} width="w-64"
      button={<><FolderOpen size={15} aria-hidden className="shrink-0 text-text-muted" /><span className="truncate font-medium">{name}</span></>}>
      {close => <WorkspaceList name={name} workspaces={workspaces} onChosen={close} />}
    </Dropdown>
  )
}

/** The place's workspaces, as the switcher and the phone's ⋮ list them. */
export function WorkspaceList({ name, workspaces, onChosen }: { name: string; workspaces: readonly SwitcherItem[]; onChosen: () => void }) {
  return (
    <ul role="menu" aria-label="Workspaces" className="max-h-80 overflow-y-auto">
      {workspaces.map(w => (
        <li key={w.id} role="none">
          <Link role="menuitem" to={workspaceViewPath(w.id)} onClick={onChosen} aria-current={w.name === name ? 'true' : undefined}
            className={`block truncate rounded-lg px-2 py-1.5 text-small ${w.name === name ? ROW_CHOSEN : ROW_ITEM}`}>
            {w.name}
          </Link>
        </li>
      ))}
    </ul>
  )
}
