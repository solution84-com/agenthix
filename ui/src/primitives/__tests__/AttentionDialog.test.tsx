// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useEffect, useRef, useState } from 'react'
import { Modal } from '../Modal'
import { useAttention, type Attention } from '../AttentionDialog'

function Probe(attention: Partial<Attention>) {
  const { show, dialog } = useAttention()
  return (
    <>
      <button onClick={() => show({ title: 'It could not be removed', text: 'Only administrators remove skills. Nothing was changed.', ...attention })}>go</button>
      <p>the page</p>
      {dialog}
    </>
  )
}

afterEach(cleanup)

describe('the attention dialog @SC-1906', () => {
  it('opens in the centre as a dialog with the words, Close and Try again, and the page keeps its layout', () => {
    const retry = vi.fn()
    render(<Probe retry={retry} />)
    expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.click(screen.getByText('go'))
    const dialog = screen.getByRole('dialog', { name: 'It could not be removed' })
    expect(dialog.textContent).toContain('Only administrators remove skills. Nothing was changed.')
    expect(screen.getByRole('alert').closest('[role="dialog"]')).toBe(dialog)
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(retry).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('has no Try again without a retry, and Close dismisses it', () => {
    render(<Probe />)
    fireEvent.click(screen.getByText('go'))
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull()
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Close' })) })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('titles itself "That did not work" when the caller gives no title', () => {
    render(<Probe title={undefined} />)
    fireEvent.click(screen.getByText('go'))
    expect(screen.getByRole('dialog', { name: 'That did not work' })).toBeTruthy()
  })

  it('draws the caller\'s own actions, each closing the dialog before it runs', () => {
    const use = vi.fn()
    const newOne = vi.fn()
    render(<Probe actions={[{ label: 'Use Sonnet', onClick: use }, { label: 'Start a new conversation', onClick: newOne, variant: 'primary' }]} />)
    fireEvent.click(screen.getByText('go'))
    fireEvent.click(screen.getByRole('button', { name: 'Start a new conversation' }))
    expect(newOne).toHaveBeenCalledTimes(1)
    expect(use).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.click(screen.getByText('go'))
    fireEvent.click(screen.getByRole('button', { name: 'Use Sonnet' }))
    expect(use).toHaveBeenCalledTimes(1)
  })

  it('takes rich text', () => {
    render(<Probe text={<>Ask <strong>an admin</strong> to add one.</>} />)
    fireEvent.click(screen.getByText('go'))
    expect(screen.getByRole('alert').textContent).toBe('Ask an admin to add one.')
  })

  it('closes on Escape', () => {
    render(<Probe />)
    fireEvent.click(screen.getByText('go'))
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('opens over a form dialog, and Escape closes only the attention dialog', () => {
    function Form() {
      const [open, setOpen] = useState(true)
      const { show, dialog } = useAttention()
      return (
        <Modal open={open} onClose={() => setOpen(false)} title="New skill">
          <input aria-label="Name" />
          <button type="button" onClick={() => show({ text: 'The name is taken.' })}>Save</button>
          {dialog}
        </Modal>
      )
    }
    render(<Form />)
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(screen.getAllByRole('dialog')).toHaveLength(2)
    expect(screen.getByRole('dialog', { name: 'That did not work' })).toBeTruthy()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: 'That did not work' })).toBeNull()
    expect(screen.getByRole('dialog', { name: 'New skill' })).toBeTruthy()
  })

  it('opened from inside a form, it is drawn at the body and none of its buttons submits the form', () => {
    const submit = vi.fn((e: { preventDefault: () => void }) => e.preventDefault())
    const retry = vi.fn()
    const act1 = vi.fn()
    function InForm() {
      const { show, dialog } = useAttention()
      return (
        <form onSubmit={submit} data-testid="form">
          <button type="button" onClick={() => show({ text: 'Not sent.', retry, actions: [{ label: 'Open Secrets', onClick: act1 }] })}>go</button>
          {dialog}
        </form>
      )
    }
    render(<InForm />)
    for (const name of ['Close', 'Open Secrets', 'Try again']) {
      fireEvent.click(screen.getByText('go'))
      const button = screen.getByRole('button', { name })
      expect(button.getAttribute('type')).toBe('button')
      expect(screen.getByTestId('form').contains(screen.getByRole('dialog'))).toBe(false)
      expect(screen.getByRole('dialog').closest('[data-attention]')).toBeTruthy()
      fireEvent.click(button)
    }
    expect(submit).not.toHaveBeenCalled()
    expect(retry).toHaveBeenCalledTimes(1)
    expect(act1).toHaveBeenCalledTimes(1)
  })

  it('opened from inside a menu that closes on a press outside it, a press on the dialog keeps the menu and its buttons work', () => {
    const act1 = vi.fn()
    function Menu() {
      const [open, setOpen] = useState(true)
      const panel = useRef<HTMLDivElement>(null)
      const { show, dialog } = useAttention()
      useEffect(() => {
        const away = (e: MouseEvent) => { if (!panel.current?.contains(e.target as Node)) setOpen(false) }
        document.addEventListener('mousedown', away)
        return () => document.removeEventListener('mousedown', away)
      }, [])
      if (!open) return <p>menu closed</p>
      return <div ref={panel}><button type="button" onClick={() => show({ text: 'Not yours.', actions: [{ label: 'Ask', onClick: act1 }] })}>item</button>{dialog}</div>
    }
    render(<Menu />)
    fireEvent.click(screen.getByText('item'))
    const ask = screen.getByRole('button', { name: 'Ask' })
    fireEvent.mouseDown(ask)
    fireEvent.click(ask)
    expect(act1).toHaveBeenCalledTimes(1)
    expect(screen.queryByText('menu closed')).toBeNull()
    fireEvent.mouseDown(document.body)
    expect(screen.getByText('menu closed')).toBeTruthy()
  })
})
