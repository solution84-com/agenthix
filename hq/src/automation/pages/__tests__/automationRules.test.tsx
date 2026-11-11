// @vitest-environment jsdom
/** The Automation tool's Rules view (every screen reviewed spec §3): the agents' switch and the limits; nothing that starts work by itself (adr-0175). */
import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

// ui resolves its own copy of lucide-react (see ProductOverviewTabSitePicker.test.tsx); its icons are mocked by that path.
const uiLucideReactPath = vi.hoisted(() => {
  const uiEntry = require.resolve('@agenthix/ui/projects')
  return require('node:module').createRequire(uiEntry).resolve('lucide-react')
})
vi.mock(uiLucideReactPath, async (importOriginal) => {
  const icon = () => null
  return { ...(await importOriginal<object>()), ChevronLeft: icon, Repeat: icon, Settings2: icon, Plus: icon }
})
import { AutomationRules, type AutomationRulesProps, type AutomationStatusView } from '@agenthix/ui/projects'

const RUN_LIMITS = { org: { timeLimitMinutes: 60, turnLimit: 500 }, own: { timeLimitMinutes: 30, turnLimit: 200 } }
const STATUS: AutomationStatusView = { org: { agentSchedules: true, maxDepth: 5 }, agentSchedules: false, agentsMaySchedule: false }

function rules(overrides: Partial<AutomationRulesProps> = {}) {
  const props: AutomationRulesProps = {
    status: STATUS, runLimits: RUN_LIMITS, canEdit: true,
    onSaveAgentSchedules: vi.fn().mockResolvedValue(undefined), onSaveTurnLimit: vi.fn().mockResolvedValue(undefined),
    onBack: vi.fn(),
    ...overrides,
  }
  return { props, view: render(<AutomationRules {...props} />) }
}

describe('the limits @SC-512 @SC-452', () => {
  it("shows the organisation's chain depth, the turn limit with the organisation's maximum, and the run time limit as set in project Settings", () => {
    rules()
    expect(screen.getByText('Chain depth').closest('div')!.parentElement!.textContent).toContain('5')
    expect(screen.getByText('Turn limit').closest('div')!.parentElement!.textContent).toContain('200org max 500')
    expect(screen.getByText('every run · set in project Settings')).toBeTruthy()
    expect(screen.getByText('30 min')).toBeTruthy()
  })

  it('has no throttle, queue limit or columns that start work (adr-0175)', () => {
    rules()
    expect(screen.queryByText('Throttle')).toBeNull()
    expect(screen.queryByText('Queue limit')).toBeNull()
    expect(screen.queryByText(/start work automatically/)).toBeNull()
  })

  it('offers no editing to someone who is not a project admin', () => {
    rules({ canEdit: false })
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull()
    expect((screen.getByRole('switch', { name: 'Agents may set start times when asked' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('keeps an edit not yet saved when the same status arrives again, and saves the turn limit', async () => {
    const { props, view } = rules()
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    fireEvent.change(screen.getByLabelText(/Turn limit/), { target: { value: '' } })
    view.rerender(<AutomationRules {...props} status={{ ...STATUS }} />)
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(props.onSaveTurnLimit).toHaveBeenCalledWith(null))
  })
})

describe("the agents' switch @SC-512", () => {
  it('saves the switch', async () => {
    const { props } = rules()
    fireEvent.click(screen.getByRole('switch', { name: 'Agents may set start times when asked' }))
    await waitFor(() => expect(props.onSaveAgentSchedules).toHaveBeenCalledWith(true))
  })

  it('cannot be switched on where the organisation does not allow it: a press tells why', () => {
    const { props } = rules({ status: { ...STATUS, org: { agentSchedules: false, maxDepth: 3 } } })
    fireEvent.click(screen.getByRole('switch', { name: 'Agents may set start times when asked' }))
    expect(props.onSaveAgentSchedules).not.toHaveBeenCalled()
    expect(screen.getByRole('alert').textContent).toBe('The organisation does not allow it.')
  })
})
