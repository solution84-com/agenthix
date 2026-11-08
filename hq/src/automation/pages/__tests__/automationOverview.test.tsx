// @vitest-environment jsdom
/** The Automation tool's first view (every screen reviewed spec §3): Now, the two buttons, and Later; no switch (adr-0175). */
import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'

// ui resolves its own copy of lucide-react (see ProductOverviewTabSitePicker.test.tsx); its icons are mocked by that path.
const uiLucideReactPath = vi.hoisted(() => {
  const uiEntry = require.resolve('@agenthix/ui/projects')
  return require('node:module').createRequire(uiEntry).resolve('lucide-react')
})
vi.mock(uiLucideReactPath, async (importOriginal) => {
  const icon = () => null
  return { ...(await importOriginal<object>()), ChevronLeft: icon, Pause: icon, Play: icon, Repeat: icon, Settings2: icon, Plus: icon }
})
import { AutomationOverview, whenLabel, type AutomationOverviewProps } from '@agenthix/ui/projects'

const CLOCK = new Date(2026, 9, 6, 10, 0)
const local = (day: number, h: number, m = 0) => new Date(2026, 9, day, h, m).toISOString()

function overview(overrides: Partial<AutomationOverviewProps> = {}) {
  const props: AutomationOverviewProps = {
    now: { running: [{ taskId: 't26', key: 'WEB-26' }, { taskId: 't24', key: 'WEB-24' }], stuck: [] },
    routineCount: 3, later: [], laterMore: 0,
    renderTaskLink: (taskId, children) => <a href={`/t/${taskId}`}>{children}</a>,
    onFix: vi.fn(), onOpenRoutine: vi.fn(), onOpenRuns: vi.fn(), onOpenRoutines: vi.fn(), onOpenRules: vi.fn(),
    clock: CLOCK,
    ...overrides,
  }
  render(<AutomationOverview {...props} />)
  return props
}

describe('when a time reads @SC-511', () => {
  it('as today, tomorrow, a weekday within the week, or a date', () => {
    expect(whenLabel(local(6, 14, 30), CLOCK)).toMatch(/^Today /)
    expect(whenLabel(local(7, 9), CLOCK)).toMatch(/^Tomorrow /)
    expect(whenLabel(local(12, 10), CLOCK)).toMatch(/^Mon /)
    expect(whenLabel(local(20, 10), CLOCK)).not.toMatch(/^(Today|Tomorrow|Mon) /)
  })
})

describe('no switch @SC-511', () => {
  it('offers no Pause or Resume, and no round: work starts only by an explicit act (adr-0175)', () => {
    overview()
    expect(screen.queryByRole('button', { name: 'Pause' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Resume' })).toBeNull()
    expect(screen.queryByText(/round/)).toBeNull()
  })
})

describe('Now @SC-511 @SC-485', () => {
  it('counts what runs', () => {
    overview()
    expect(screen.getByText('2 running')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'WEB-26' })).toBeTruthy()
  })

  it('names a stuck task with its fix', () => {
    const props = overview({ now: { running: [], stuck: [{ kind: 'noAgent', taskId: 't23', key: 'WEB-23', title: 'Nav' }] } })
    expect(screen.getByText("WEB-23 couldn't queue")).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Assign' }))
    expect(props.onFix).toHaveBeenCalledWith(expect.objectContaining({ taskId: 't23' }))
  })
})

describe('Routines and Rules, then Later @SC-511', () => {
  it('opens each view from its button', () => {
    const props = overview()
    fireEvent.click(screen.getByRole('button', { name: /Routines/ }))
    fireEvent.click(screen.getByRole('button', { name: /Rules/ }))
    fireEvent.click(screen.getByRole('button', { name: /See them in Runs/ }))
    expect(props.onOpenRoutines).toHaveBeenCalled()
    expect(props.onOpenRules).toHaveBeenCalled()
    expect(props.onOpenRuns).toHaveBeenCalled()
  })

  it('lists what will start as given, each saying where it comes from, with no switches', () => {
    overview({
      later: [
        { kind: 'routine', at: local(7, 9), routineId: 'r1', title: 'Daily site audit' },
        { kind: 'task', at: local(13, 14, 30), taskId: 't33', key: 'WEB-33', title: 'Generate sitemap' },
      ],
      laterMore: 2,
    })
    const later = screen.getByTestId('automation-later')
    const rows = within(later).getAllByRole('listitem')
    expect(rows[0].textContent).toMatch(/^Tomorrow .*Daily site auditfrom a routine$/)
    expect(rows[1].textContent).toMatch(/WEB-33 Generate sitemapstart time set on the task$/)
    expect(within(later).queryByRole('switch')).toBeNull()
    expect(screen.getByText('and 2 more')).toBeTruthy()
  })
})
