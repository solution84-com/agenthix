import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { EmptyState, HostingBadge, StatePill } from '@agenthix/ui/primitives'
import { ConfirmModal, ListTitleRow, ThemeSwitch } from '../components'

afterEach(() => {
  cleanup()
  localStorage.clear()
  document.documentElement.removeAttribute('data-theme')
})

describe('the components', () => {
  it('a state pill and the hosting badge say their state in words', () => {
    render(<><StatePill tone="warning">Disk 91%</StatePill><HostingBadge where="self-hosted" /><HostingBadge where="cloud" /><HostingBadge where="cloud" short /></>)
    expect(screen.getByText('Disk 91%')).toBeTruthy()
    expect(screen.getByText('Self-hosted')).toBeTruthy()
    expect(screen.getByText('Agenthix Cloud')).toBeTruthy()
    expect(screen.getByText('Cloud')).toBeTruthy()
  })

  it('an inline empty state says what is missing and offers what to do', () => {
    render(<EmptyState variant="inline" title="No site runs on another machine yet." action={<button type="button">Add a site</button>} />)
    expect(screen.getByText('No site runs on another machine yet.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Add a site' })).toBeTruthy()
  })

  it('a confirmation names its action, and cancels or confirms', () => {
    const onConfirm = vi.fn()
    const onCancel = vi.fn()
    render(<ConfirmModal open title="Disconnect laptop?" confirmLabel="Disconnect laptop" destructive onConfirm={onConfirm} onCancel={onCancel}>Its agents stop.</ConfirmModal>)
    fireEvent.click(screen.getByRole('button', { name: 'Disconnect laptop' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onConfirm).toHaveBeenCalledOnce()
    expect(onCancel).toHaveBeenCalledOnce()
  })

  it("a list's title row finds as one types", () => {
    const onChange = vi.fn()
    render(<ListTitleRow title="Fleet" find={{ label: 'Find a site', value: '', onChange }} />)
    fireEvent.change(screen.getByLabelText('Find a site'), { target: { value: 'hel' } })
    expect(onChange).toHaveBeenCalledWith('hel')
  })

  it('the theme switch applies and remembers the choice', () => {
    render(<ThemeSwitch />)
    expect(screen.getByRole('button', { name: 'Light' }).getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: 'Dark' }))
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
    expect(localStorage.getItem('theme')).toBe('dark')
    expect(screen.getByRole('button', { name: 'Dark' }).getAttribute('aria-pressed')).toBe('true')
  })
})
