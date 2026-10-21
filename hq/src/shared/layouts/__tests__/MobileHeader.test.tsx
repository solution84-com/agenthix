// @vitest-environment jsdom
/**
 * @SC-220 @SC-221
 * The mobile header: ☰ opens the navigation drawer; Notifications and Runs at the top right.
 */
import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

vi.mock('lucide-react', () => ({ Menu: () => null }))
const mockOpenDrawer = vi.fn()
vi.mock('../../context/NavDrawerContext', () => ({
  useNavDrawer: () => ({ openDrawer: mockOpenDrawer, open: false, closeDrawer: vi.fn(), toggleDrawer: vi.fn() }),
}))
vi.mock('../ShellPanelButtons', () => ({ ShellPanelButtons: () => <div data-testid="panel-buttons" /> }))

import { MobileHeader } from '../MobileHeader'

describe('MobileHeader @SC-220 @SC-221 @SC-152', () => {
  it('opens the drawer from ☰', () => {
    render(<MobileHeader title="Agenthix" />)
    fireEvent.click(screen.getByRole('button', { name: 'Open menu' }))
    expect(mockOpenDrawer).toHaveBeenCalledTimes(1)
  })

  it('shows the title and the Notifications and Runs buttons, and only below the lg breakpoint', () => {
    render(<MobileHeader title="Agenthix" />)
    expect(screen.getByText('Agenthix')).toBeTruthy()
    expect(screen.getByTestId('panel-buttons')).toBeTruthy()
    expect(screen.getByTestId('mobile-header').className.split(' ')).toContain('lg:hidden')
  })
})
