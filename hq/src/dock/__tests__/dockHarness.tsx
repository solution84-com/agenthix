/**
 * The root shell with a few stand-in pages, for the dock's tests. The test file mocks the frame's parts, the
 * conversation thread and Wasp's operations before importing this.
 */
import { useState } from 'react'
import { render } from '@testing-library/react'
import {
  Link, MemoryRouter, Outlet, Route, RouterProvider, Routes, createMemoryRouter, useLocation, useNavigate, type RouteObject,
} from 'react-router'
import { RootShell } from '../../shared/layouts/RootShell'
import { AppShell } from '../../shared/layouts/AppShell'
import { NavDrawerProvider } from '../../shared/context/NavDrawerContext'
import { TalkButton } from '../../places/components/TalkButton'

export const canvasMounts = { projects: 0, home: 0 }

function Nav() {
  return (
    <nav aria-label="test links">
      <Link to="/">to home</Link>
      <Link to="/projects">to projects</Link>
      <Link to="/tasks">to tasks</Link>
      <Link to="/bare">to bare</Link>
      <Link to="/chat/t/c1">open c1</Link>
      <Link to="/projects/AGX/t/c2">open c2</Link>
    </nav>
  )
}

function ProjectsPage() {
  const [instance] = useState(() => ++canvasMounts.projects)
  return (
    <AppShell breadcrumbs={[{ label: 'Projects' }]}>
      <div data-testid="projects-page" data-instance={instance}>
        <input aria-label="Filter projects" defaultValue="" />
        <Link data-testid="conversation-row" to="/chat/t/c1">c1 row</Link>
      </div>
    </AppShell>
  )
}

function HomePage() {
  const [instance] = useState(() => ++canvasMounts.home)
  const navigate = useNavigate()
  const [sent, setSent] = useState(false)
  return (
    <AppShell breadcrumbs={[{ label: 'Home' }]}>
      <div data-testid="home-page" data-instance={instance}>
        {/* What the box does once the conversation is started: go to its address, then empty itself. */}
        <button disabled={sent} onClick={() => { setSent(true); setTimeout(() => { navigate('/chat/t/c3'); setSent(false) }, 0) }}>
          {sent ? 'sending…' : 'send from home'}
        </button>
      </div>
    </AppShell>
  )
}

const page = (label: string) => <AppShell breadcrumbs={[{ label }]}><span>{label} page</span></AppShell>

const agx = { homePath: '/projects/AGX', basePath: '/projects/AGX', talkLabel: 'Talk about Agenthix', sessionLocation: { primaryOwnerType: 'project' as const, primaryOwnerId: 'p1' } }
const coder = { homePath: '/agents/coder', basePath: '/agents/coder', talkLabel: 'Talk to Coder', sessionLocation: null, defaultAgentId: 'a-Coder' }

const children: RouteObject[] = [
  { path: '/', element: <HomePage /> },
  { path: '/projects', element: <ProjectsPage /> },
  { path: '/projects/:key', element: <AppShell breadcrumbs={[{ label: 'Project' }]} screenBarRight={<TalkButton place={agx} />}><span>Project page</span></AppShell> },
  { path: '/agents/:handle', element: <AppShell breadcrumbs={[{ label: 'Coder' }]} screenBarRight={<TalkButton place={coder} />}><span>Agent page</span></AppShell> },
  { path: '/tasks/:taskKey', element: page('Task') },
  { path: '/projects/:key/t/:conversationId', element: page('Project thread') },
  { path: '/tasks', element: page('Tasks') },
  { path: '/chat', element: page('Chat') },
  { path: '/chat/t/:conversationId', element: page('Chat thread') },
  { path: '/bare', element: <span>bare page</span> },
]

const shell = (dataRouter: boolean) => <NavDrawerProvider><RootShell dataRouter={dataRouter}><Nav /><Outlet /></RootShell></NavDrawerProvider>
const root = shell(false)

/** Wasp's router is a data router: navigations to a conversation's address are stopped before the canvas moves. */
export function renderDataRouter(at: string, more: RouteObject[] = []) {
  const router = createMemoryRouter([{ element: shell(true), children: [...children, ...more] }], { initialEntries: [at] })
  const view = render(<RouterProvider router={router} />)
  return { router, ...view, here: () => router.state.location.pathname + router.state.location.search }
}

/** Under any other router the shell reads the address after the canvas has moved. */
export function renderPlainRouter(at: string) {
  let here = ''
  function Here() {
    const at = useLocation()
    here = at.pathname + at.search
    return null
  }
  const view = render(
    <MemoryRouter initialEntries={[at]}>
      <Routes>
        <Route element={root}>
          {children.map((c) => <Route key={c.path} path={c.path} element={c.element} />)}
        </Route>
      </Routes>
      <Here />
    </MemoryRouter>,
  )
  return { ...view, here: () => here }
}
