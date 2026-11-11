import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { OverflowMenu } from '../OverflowMenu'

afterEach(cleanup)

describe('a refused item in the ⋯ menu @SC-1907', () => {
  const items = [
    { label: 'Move to the top', onSelect: vi.fn(), disabledReason: 'It is already the first task.' },
    { label: 'Archive', onSelect: vi.fn() },
  ]

  it('is focusable, says why in its tooltip and its description, and a press says it in the dialog without running', () => {
    render(<OverflowMenu items={items} />)
    fireEvent.click(screen.getByRole('button', { name: 'More actions' }))
    const item = screen.getByRole('menuitem', { name: 'Move to the top' }) as HTMLButtonElement
    expect(item.disabled).toBe(false)
    expect(item.getAttribute('aria-disabled')).toBe('true')
    expect(document.getElementById(item.getAttribute('aria-describedby') ?? '')?.textContent).toBe('It is already the first task.')
    fireEvent.focus(item)
    expect(screen.getByTestId('tooltip').textContent).toBe('It is already the first task.')
    fireEvent.click(item)
    expect(items[0].onSelect).not.toHaveBeenCalled()
    expect(screen.queryByRole('menuitem')).toBeNull()
    expect(screen.getByRole('dialog', { name: 'Not available now' }).textContent).toContain('It is already the first task.')
  })

  it('leaves the other items working', () => {
    render(<OverflowMenu items={items} />)
    fireEvent.click(screen.getByRole('button', { name: 'More actions' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Archive' }))
    expect(items[1].onSelect).toHaveBeenCalledTimes(1)
  })
})

describe('an item that asks first @SC-1936', () => {
  it('asks in the confirm dialog, and acts only on its button', () => {
    const onDelete = vi.fn()
    render(<OverflowMenu items={[{ label: 'Delete workspace', danger: true, confirmLabel: 'Its files go with it.', onSelect: onDelete }]} />)
    fireEvent.click(screen.getByRole('button', { name: 'More actions' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete workspace' }))
    expect(onDelete).not.toHaveBeenCalled()
    const dialog = screen.getByRole('dialog', { name: 'Delete workspace?' })
    expect(dialog.textContent).toContain('Its files go with it.')
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onDelete).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'More actions' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete workspace' }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete workspace' }))
    expect(onDelete).toHaveBeenCalledTimes(1)
  })
})
