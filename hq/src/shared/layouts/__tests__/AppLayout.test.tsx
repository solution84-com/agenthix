// @vitest-environment jsdom
import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router'

vi.mock('../../components/AppSidebar', () => ({
  AppSidebar: ({ menuHidden }: { menuHidden: boolean }) => <nav data-testid="sidebar" data-menu-hidden={String(menuHidden)} />,
}))
vi.mock('../MobileHeader', async () => {
  const { usePublishedPhoneActions } = await import('../phoneActions')
  return {
    MobileHeader: ({ title }: { title: string }) => {
      const actions = usePublishedPhoneActions()
      return <header data-testid="mobile-header">{title}{actions.map((a) => <button key={a.label} onClick={a.onSelect}>⋯ {a.label}</button>)}</header>
    },
  }
})
vi.mock('../ShellPanelHost', () => ({ ShellPanelHost: () => null }))
vi.mock('../ShellNotices', () => ({ ShellNotices: () => null }))
import { AppLayout } from '../AppLayout'
import { ProjectLayout, toolOfProjectPath } from '../ProjectLayout'
import { ToolPanelBoundary } from '../../../places/toolPanelContext'

beforeEach(() => {
  try { localStorage.clear() } catch { /* jsdom always has it */ }
})

describe('AppLayout responsive container @SC-219 @SC-224', () => {
  it('renders children', () => {
    render(<MemoryRouter><AppLayout><span>content</span></AppLayout></MemoryRouter>)
    expect(screen.getByText('content')).toBeTruthy()
  })

  it('does not render nav-drawer-backdrop when drawer is closed', () => {
    render(<MemoryRouter><AppLayout><span>content</span></AppLayout></MemoryRouter>)
    expect(screen.queryByTestId('nav-drawer-backdrop')).toBeNull()
  })
})

describe('AppLayout screen bar @SC-011 @SC-151 @SC-152', () => {
  it('shows the breadcrumb in the screen bar, and the last crumb as the mobile title', () => {
    render(
      <MemoryRouter>
        <AppLayout breadcrumbs={[{ label: 'Projects', href: '/projects' }, { label: 'Agenthix' }]}>
          <span>content</span>
        </AppLayout>
      </MemoryRouter>,
    )
    const bar = screen.getByTestId('screen-bar')
    expect(bar.textContent).toContain('Projects')
    expect(bar.textContent).toContain('Agenthix')
    expect(screen.getByTestId('mobile-header').textContent).toBe('Agenthix')
  })

  it('names the browser tab after the screen, and gives the tab back when the screen goes', () => {
    const { unmount } = render(
      <MemoryRouter>
        <AppLayout breadcrumbs={[{ label: 'Tasks', href: '/tasks' }, { label: 'Done' }]}><span>content</span></AppLayout>
      </MemoryRouter>,
    )
    expect(document.title).toBe('Done · Tasks · Agenthix')
    unmount()
    expect(document.title).toBe('Agenthix')
  })

  it('keeps the page title, subtitle and action pages pass today', () => {
    render(
      <MemoryRouter>
        <AppLayout title="Library" subtitle="Skills" action={<button>Add</button>}><span>content</span></AppLayout>
      </MemoryRouter>,
    )
    expect(screen.getByRole('heading', { name: 'Library' })).toBeTruthy()
    expect(screen.getByText('Skills')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Add' })).toBeTruthy()
  })

  it('puts the page’s phone actions behind the top bar’s ⋯, and draws its action from lg up only', () => {
    const onAdd = vi.fn()
    render(
      <MemoryRouter>
        <AppLayout title="Library" action={<button>Add</button>} phoneActions={[{ label: 'Add', onSelect: onAdd }]}><span>content</span></AppLayout>
      </MemoryRouter>,
    )
    expect(screen.getByRole('button', { name: 'Add' }).parentElement!.className).toContain('max-lg:hidden')
    screen.getByRole('button', { name: '⋯ Add' }).click()
    expect(onAdd).toHaveBeenCalledTimes(1)
  })

  it('opens with a place’s menu hidden when the person hid it before', () => {
    localStorage.setItem('placeMenuHidden', '1')
    render(<MemoryRouter><AppLayout><span>content</span></AppLayout></MemoryRouter>)
    expect(screen.getByTestId('sidebar').getAttribute('data-menu-hidden')).toBe('true')
  })
})

function Where() {
  const { pathname, search } = useLocation()
  return <span data-testid="where">{pathname + search}</span>
}

function renderAt(path: string, node: React.ReactNode) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/projects/:key" element={<Where />} />
        <Route path="/projects/:key/*" element={node} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('ProjectLayout @SC-495', () => {
  it('opens a former tab’s address as the project with that tool open', () => {
    renderAt('/projects/AGX/routines', <ProjectLayout><span>content</span></ProjectLayout>)
    expect(screen.getByTestId('where').textContent).toBe('/projects/AGX?tool=routines')
  })

  it('draws only the page’s content inside the tools panel', () => {
    renderAt('/projects/AGX/tasks', <ToolPanelBoundary><ProjectLayout breadcrumbs={[{ label: 'Projects' }]}><span>content</span></ProjectLayout></ToolPanelBoundary>)
    expect(screen.getByText('content')).toBeTruthy()
    expect(screen.queryByTestId('screen-bar')).toBeNull()
  })

  it('keeps the shell, with no tab bar, around a page of its own', () => {
    renderAt('/projects/AGX/boards/b1', <ProjectLayout breadcrumbs={[{ label: 'Projects' }]}><span>content</span></ProjectLayout>)
    expect(screen.getByTestId('screen-bar')).toBeTruthy()
    expect(screen.getByText('content')).toBeTruthy()
  })
})

describe('toolOfProjectPath @SC-495', () => {
  it('maps each former tab to its tool', () => {
    expect(toolOfProjectPath('/projects/AGX/tasks', 'AGX')).toBe('tasks')
    expect(toolOfProjectPath('/projects/AGX/github', 'AGX')).toBe('files')
    expect(toolOfProjectPath('/projects/AGX/routines/', 'AGX')).toBe('routines')
  })

  it('maps nothing else', () => {
    expect(toolOfProjectPath('/projects/AGX', 'AGX')).toBeNull()
    expect(toolOfProjectPath('/projects/AGX/boards/b1', 'AGX')).toBeNull()
    expect(toolOfProjectPath('/projects/AGX/constructor', 'AGX')).toBeNull()
  })
})
