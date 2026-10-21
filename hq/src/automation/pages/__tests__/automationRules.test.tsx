// @vitest-environment jsdom
/** The Automation tool's Rules view (every screen reviewed spec §3): the agents' switch, the limits with the organisation's maximum, and the columns that start work. */
import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'

// ui resolves its own copy of lucide-react (see ProductOverviewTabSitePicker.test.tsx); its icons are mocked by that path.
const uiLucideReactPath = vi.hoisted(() => {
  const uiEntry = require.resolve('@agenthix/ui/projects')
  return require('node:module').createRequire(uiEntry).resolve('lucide-react')
})
vi.mock(uiLucideReactPath, () => {
  const icon = () => null
  return { ChevronLeft: icon, Pause: icon, Play: icon, Repeat: icon, Settings2: icon, Plus: icon }
})
import { AutomationRules, type AutomationRulesProps } from '@agenthix/ui/projects'
import { status } from './automationStatusFixture'

const RUN_LIMITS = { org: { timeLimitMinutes: 60, turnLimit: 500 }, own: { timeLimitMinutes: 30, turnLimit: 200 } }

function rules(overrides: Partial<AutomationRulesProps> = {}) {
  const props: AutomationRulesProps = {
    status: status(true), runLimits: RUN_LIMITS, canEdit: true,
    onSaveChoice: vi.fn().mockResolvedValue(undefined), onSaveLimits: vi.fn().mockResolvedValue(undefined),
    columns: [{ boardId: 'b1', name: 'Release board', columns: ['In progress', 'Review'] }],
    renderBoardLink: (boardId, children) => <a href={`/boards/${boardId}`}>{children}</a>,
    onBack: vi.fn(),
    ...overrides,
  }
  return { props, view: render(<AutomationRules {...props} />) }
}

describe('the limits @SC-512 @SC-452', () => {
  it("shows each limit with the organisation's maximum, and the run time limit as set in project Settings", () => {
    rules()
    expect(screen.getByText('Chain depth').closest('div')!.parentElement!.textContent).toContain('org max 5')
    expect(screen.getByText('Queue limit').closest('div')!.parentElement!.textContent).toContain('10org max 20')
    expect(screen.getByText('Turn limit').closest('div')!.parentElement!.textContent).toContain('200org max 500')
    expect(screen.getByText('every run · set in project Settings')).toBeTruthy()
    expect(screen.getByText('30 min')).toBeTruthy()
    expect(screen.getByText('Off')).toBeTruthy()
  })

  it('offers no editing to someone who is not a project admin', () => {
    rules({ canEdit: false })
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull()
    expect((screen.getByRole('switch', { name: 'Agents may set start times when asked' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('keeps an edit not yet saved when the same status arrives again', async () => {
    const { props, view } = rules()
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    fireEvent.click(screen.getByRole('switch', { name: 'Throttle' }))
    view.rerender(<AutomationRules {...props} status={status(true)} />)
    fireEvent.change(screen.getByLabelText(/Chain depth/), { target: { value: '1' } })
    fireEvent.change(screen.getByLabelText(/Turn limit/), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(props.onSaveLimits).toHaveBeenCalledTimes(1))
    expect(vi.mocked(props.onSaveLimits).mock.calls[0][0]).toMatchObject({ choice: { throttle: true, maxDepth: 1, queueLimit: 10 }, turnLimit: null })
  })

  it('shows the interval and batch only with the throttle on, fixed on where the organisation requires it', () => {
    const s = status(true)
    s.org.throttle = true
    rules({ status: s })
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    const sw = screen.getByRole('switch', { name: 'Throttle' })
    expect(sw.getAttribute('aria-checked')).toBe('true')
    expect((sw as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByLabelText(/Every \(minutes\)/)).toBeTruthy()
  })
})

describe("the agents' switch @SC-512", () => {
  it('saves the stored choice with only the switch changed', async () => {
    const { props } = rules()
    fireEvent.click(screen.getByRole('switch', { name: 'Agents may set start times when asked' }))
    await waitFor(() => expect(props.onSaveChoice).toHaveBeenCalledTimes(1))
    expect(vi.mocked(props.onSaveChoice).mock.calls[0][0]).toEqual({ ...status(true).choice, agentSchedules: true })
  })
})

describe('the columns that start work automatically @SC-512', () => {
  it('names each board as a link, with its columns switched on, and has no switch of its own', () => {
    rules()
    const list = screen.getByTestId('automation-columns')
    expect(within(list).getByRole('link', { name: 'Release board' }).getAttribute('href')).toBe('/boards/b1')
    expect(list.textContent).toContain('In progress, Review')
    expect(within(list).queryByRole('switch')).toBeNull()
  })

  it('says so when no column starts work', () => {
    rules({ columns: [] })
    expect(screen.getByText('No column starts work automatically.')).toBeTruthy()
  })
})
