import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { useState } from 'react'
import { Modal } from '../Modal'

describe('Modal', () => {
  it('is a dialog named by its title, so a screen reader announces it', () => {
    render(<Modal open onClose={() => {}} title="Remove laptop-mia?"><button type="button">Remove laptop-mia</button></Modal>)
    const dialog = screen.getByRole('dialog', { name: 'Remove laptop-mia?' })
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    expect(dialog.contains(screen.getByRole('button', { name: 'Remove laptop-mia' }))).toBe(true)
  })

  it('moves focus in, holds Tab inside, and returns focus to the opener on close', () => {
    function Host() {
      const [open, setOpen] = useState(false)
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>Opener</button>
          <Modal open={open} onClose={() => setOpen(false)} title="T">
            <button type="button">First</button>
            <button type="button">Last</button>
          </Modal>
        </>
      )
    }
    render(<Host />)
    const opener = screen.getByRole('button', { name: 'Opener' })
    opener.focus()
    fireEvent.click(opener)
    const first = screen.getByRole('button', { name: 'First' })
    const last = screen.getByRole('button', { name: 'Last' })
    expect(document.activeElement).toBe(first)
    last.focus()
    fireEvent.keyDown(document, { key: 'Tab' })
    expect(document.activeElement).toBe(first)
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(last)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(opener)
  })

  it('as a right-hand panel, still moves focus in, holds Tab and returns focus on close', () => {
    function Host() {
      const [open, setOpen] = useState(false)
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>Opener</button>
          <Modal open={open} onClose={() => setOpen(false)} title="Panel" side="right" maxWidth="max-w-[1100px]">
            <button type="button">First</button>
            <button type="button">Last</button>
          </Modal>
        </>
      )
    }
    render(<Host />)
    const opener = screen.getByRole('button', { name: 'Opener' })
    opener.focus()
    fireEvent.click(opener)
    const dialog = screen.getByRole('dialog', { name: 'Panel' })
    expect(dialog.className).toContain('h-full')
    const first = screen.getByRole('button', { name: 'First' })
    const last = screen.getByRole('button', { name: 'Last' })
    expect(document.activeElement).toBe(first)
    last.focus()
    fireEvent.keyDown(document, { key: 'Tab' })
    expect(document.activeElement).toBe(first)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(opener)
  })

  it('closes only the innermost of stacked modals on Escape', () => {
    const outer = vi.fn()
    const inner = vi.fn()
    render(
      <>
        <Modal open onClose={outer} title="Outer"><button type="button">a</button></Modal>
        <Modal open onClose={inner} title="Inner"><button type="button">b</button></Modal>
      </>,
    )
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(inner).toHaveBeenCalledTimes(1)
    expect(outer).not.toHaveBeenCalled()
  })

  it('draws a ✕ at the title’s right when given its name, and closes on it', () => {
    const onClose = vi.fn()
    render(<Modal open onClose={onClose} title="Stop every run?" closeLabel="Close"><p>body</p></Modal>)
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('opens with focus on its first control past the ✕, so the ✕’s tooltip is not shown', () => {
    render(<Modal open onClose={() => {}} title="Start Maple on 1 task?" closeLabel="Close"><button type="button">Cancel</button></Modal>)
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByTestId('tooltip')).toBeNull()
  })

  it('focuses the dialog itself when the ✕ is its only control', () => {
    render(<Modal open onClose={() => {}} title="Done" closeLabel="Close"><p>body</p></Modal>)
    expect(document.activeElement).toBe(screen.getByRole('dialog'))
    expect(screen.queryByTestId('tooltip')).toBeNull()
  })

  it('draws no ✕ unless asked', () => {
    render(<Modal open onClose={() => {}} title="T"><p>body</p></Modal>)
    expect(screen.queryByRole('button', { name: 'Close' })).toBeNull()
  })

  it('fills a phone screen when asked: no margin, no rounding, full height, its body scrolling', () => {
    render(<Modal open onClose={() => {}} title="Memory" fullScreenBelow="sm"><p>body</p></Modal>)
    const dialog = screen.getByRole('dialog', { name: 'Memory' })
    for (const c of ['max-sm:h-full', 'max-sm:max-w-none', 'max-sm:rounded-none', 'max-sm:border-0']) expect(dialog.className).toContain(c)
    expect(dialog.parentElement!.className).toContain('max-sm:p-0')
    expect(screen.getByText('body').parentElement!.className).toContain('max-sm:overflow-y-auto')
  })

  it('keeps its margin and rounding on a phone unless asked', () => {
    render(<Modal open onClose={() => {}} title="T"><p>body</p></Modal>)
    expect(screen.getByRole('dialog').className).not.toContain('max-sm:')
    expect(screen.getByRole('dialog').parentElement!.className).not.toContain('max-sm:p-0')
  })
})
