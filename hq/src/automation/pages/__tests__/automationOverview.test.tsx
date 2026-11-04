// @vitest-environment jsdom
/** The Automation tool's first view (every screen reviewed spec §3): status and Pause, Now, the two buttons, and Later. */
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
import { automationState, nowCounts } from '../AutomationTool'
import { status } from './automationStatusFixture'

const CLOCK = new Date(2026, 9, 6, 10, 0)
const local = (day: number, h: number, m = 0) => new Date(2026, 9, day, h, m).toISOString()

function overview(overrides: Partial<AutomationOverviewProps> = {}) {
  const props: AutomationOverviewProps = {
    state: 'running', onToggle: vi.fn(),
    now: { running: [{ taskId: 't26', key: 'WEB-26' }, { taskId: 't24', key: 'WEB-24' }], inLine: 3, round: { open: false, nextAt: local(6, 14, 30) }, stuck: [] },
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

describe('the status @SC-511', () => {
  it('reads Running with Pause, or Paused with Resume', () => {
    overview()
    expect(screen.getByText('Running')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Pause' })).toBeTruthy()
  })

  it('is decided by the organisation first, then the project', () => {
    const off = status(true)
    off.org.allowed = false
    expect(automationState(off)).toBe('orgOff')
    expect(automationState(status(false))).toBe('paused')
    expect(automationState(status(true))).toBe('running')
  })

  it('offers Resume disabled, with why, to someone who may not change it', () => {
    overview({ state: 'paused', toggleRefusal: 'Only a project admin can pause or resume automation.' })
    expect((screen.getByRole('button', { name: 'Resume' }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText('Only a project admin can pause or resume automation.')).toBeTruthy()
  })
})

describe('Now @SC-511 @SC-485', () => {
  it('counts what runs and what is in line, with the next round when throttled', () => {
    overview()
    expect(screen.getByText('2 running')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'WEB-26' })).toBeTruthy()
    expect(screen.getByText('3 in line').parentElement!.textContent).toMatch(/next round Today/)
  })

  it('names a stuck task with its fix', () => {
    const props = overview({ now: { running: [], inLine: 0, round: null, stuck: [{ kind: 'noAgent', taskId: 't23', key: 'WEB-23', title: 'Nav' }] } })
    expect(screen.getByText("WEB-23 couldn't queue")).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Assign' }))
    expect(props.onFix).toHaveBeenCalledWith(expect.objectContaining({ taskId: 't23' }))
  })

  it('in line counts the queued and the throttled; the round only where the throttle holds work', () => {
    const s = status(true)
    s.queued = 2
    s.throttled = 1
    s.effective.throttle = true
    s.nextPulseAt = '2026-10-06T14:30:00.000Z'
    expect(nowCounts(s)).toEqual({ inLine: 3, round: { open: false, nextAt: '2026-10-06T14:30:00.000Z' } })
    s.roundOpen = true
    expect(nowCounts(s).round).toEqual({ open: true })
    s.throttled = 0
    expect(nowCounts(s).round).toBeNull()
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
