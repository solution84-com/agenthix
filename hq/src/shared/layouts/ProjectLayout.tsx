import type { ReactNode } from 'react'
import { Navigate, useLocation, useParams } from 'react-router'
import { AppShell } from './AppShell'
import type { Breadcrumb } from './ScreenBar'
import { useInToolPanel } from '../../places/toolPanelContext'

// A project's former page addresses, and the tab each one now opens.
const TOOL_OF_TAB: Record<string, string> = {
  tasks: 'tasks',
  boards: 'boards',
  files: 'files',
  github: 'files',
  workspaces: 'workspaces',
  routines: 'routines',
  settings: 'settings',
}

/** The tab a former page's address opens, e.g. `/projects/AGX/routines` → `routines`. */
export function toolOfProjectPath(pathname: string, key: string): string | null {
  const [first, second, tab, ...rest] = pathname.split('/').filter(Boolean)
  if (first !== 'projects' || second !== key || !tab || rest.length > 0) return null
  return Object.hasOwn(TOOL_OF_TAB, tab) ? TOOL_OF_TAB[tab] : null
}

interface ProjectLayoutProps {
  children: ReactNode
  breadcrumbs?: Breadcrumb[]
}

/**
 * The frame of a project's pages. A project's views are its sections, drawn by the project's place screen. So a page
 * drawn as a section gets no frame of its own; a former page's address opens the project on that section; and a page that
 * is still a page of its own gets the shell around it.
 */
export function ProjectLayout({ children, breadcrumbs }: ProjectLayoutProps) {
  const inToolPanel = useInToolPanel()
  const { key } = useParams<{ key: string }>()
  const { pathname } = useLocation()
  if (inToolPanel) return <>{children}</>

  const tool = key ? toolOfProjectPath(pathname, key) : null
  if (key && tool) return <Navigate to={`/projects/${key}?tool=${tool}`} replace />

  return (
    <AppShell breadcrumbs={breadcrumbs}>
      <main className="flex flex-col flex-1 min-w-0 overflow-hidden">
        {children}
      </main>
    </AppShell>
  )
}
