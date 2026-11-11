// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { Button } from '../Button'
import { useRefusal, type Refusal } from '../useRefusal'

const NO_VOICE: Refusal = {
  reason: 'Voice isn\'t set up: no speech to text provider has been added.',
  title: 'Voice isn\'t set up',
  detail: 'No speech to text provider has been added. An organisation admin can add one in Settings.',
}

afterEach(cleanup)

describe('a refused button @SC-1907', () => {
  it('stays focusable and says it is unavailable, without being disabled', () => {
    render(<Button refusal={NO_VOICE}>Start voice</Button>)
    const button = screen.getByRole('button', { name: 'Start voice' })
    expect(button.hasAttribute('disabled')).toBe(false)
    expect(button.getAttribute('aria-disabled')).toBe('true')
    button.focus()
    expect(document.activeElement).toBe(button)
  })

  it('gives the reason as its accessible description', () => {
    render(<Button refusal={NO_VOICE}>Start voice</Button>)
    const button = screen.getByRole('button', { name: 'Start voice' })
    const described = document.getElementById(button.getAttribute('aria-describedby') ?? '')
    expect(described?.textContent).toBe(NO_VOICE.reason)
  })

  it('shows the reason in a tooltip on hover and on keyboard focus', () => {
    render(<Button refusal={NO_VOICE}>Start voice</Button>)
    const button = screen.getByRole('button', { name: 'Start voice' })
    fireEvent.mouseEnter(button)
    expect(screen.getByTestId('tooltip').textContent).toBe(NO_VOICE.reason)
    fireEvent.mouseLeave(button)
    expect(screen.queryByTestId('tooltip')).toBeNull()
    fireEvent.focus(button)
    expect(screen.getByTestId('tooltip').textContent).toBe(NO_VOICE.reason)
  })

  it('does not run its action when pressed, and opens the dialog with the full explanation instead', () => {
    const act = vi.fn()
    render(<Button refusal={NO_VOICE} onClick={act}>Start voice</Button>)
    fireEvent.click(screen.getByRole('button', { name: 'Start voice' }))
    expect(act).not.toHaveBeenCalled()
    const dialog = screen.getByRole('dialog', { name: 'Voice isn\'t set up' })
    expect(dialog.textContent).toContain('An organisation admin can add one in Settings.')
  })

  it('opens the dialog from Enter and Space, the keys a button answers', () => {
    const act = vi.fn()
    render(<Button refusal={NO_VOICE} onClick={act}>Start voice</Button>)
    const button = screen.getByRole('button', { name: 'Start voice' })
    // A browser turns Enter and Space on a focused button into a click; jsdom does not, so the click is that press.
    for (const key of ['Enter', ' ']) {
      fireEvent.keyDown(button, { key })
      fireEvent.click(button)
      expect(screen.getByRole('dialog')).toBeTruthy()
      fireEvent.keyDown(document, { key: 'Escape' })
      expect(screen.queryByRole('dialog')).toBeNull()
    }
    expect(act).not.toHaveBeenCalled()
  })

  it('does not submit its form', () => {
    const submit = vi.fn((e: { preventDefault: () => void }) => e.preventDefault())
    render(<form onSubmit={submit}><Button type="submit" refusal={NO_VOICE}>Send</Button></form>)
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    expect(submit).not.toHaveBeenCalled()
  })

  it('carries the refusal\'s actions into its dialog', () => {
    const add = vi.fn()
    render(<Button refusal={{ ...NO_VOICE, actions: [{ label: 'Open Settings', onClick: add, variant: 'primary' }] }}>Start voice</Button>)
    fireEvent.click(screen.getByRole('button', { name: 'Start voice' }))
    fireEvent.click(screen.getByRole('button', { name: 'Open Settings' }))
    expect(add).toHaveBeenCalledTimes(1)
  })

  it('uses the reason as the dialog\'s words when it has no detail', () => {
    render(<Button refusal={{ reason: 'Only administrators remove skills.' }}>Remove</Button>)
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }))
    expect(screen.getByRole('alert').textContent).toBe('Only administrators remove skills.')
  })

  it('runs its action as usual with no refusal', () => {
    const act = vi.fn()
    render(<Button onClick={act}>Start voice</Button>)
    const button = screen.getByRole('button', { name: 'Start voice' })
    expect(button.hasAttribute('aria-disabled')).toBe(false)
    fireEvent.click(button)
    expect(act).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

describe('useRefusal on any control @SC-1907', () => {
  function IconButton({ refusal, onPress }: { refusal?: Refusal; onPress: () => void }) {
    const refused = useRefusal(refusal)
    return (
      <>
        <button type="button" aria-label="Start voice" onClick={onPress} {...refused.props}>🎙</button>
        {refused.dialog}
      </>
    )
  }

  it('spread onto a control, refuses it and opens the dialog on a press', () => {
    const press = vi.fn()
    render(<IconButton refusal={NO_VOICE} onPress={press} />)
    const button = screen.getByRole('button', { name: 'Start voice' })
    expect(button.getAttribute('aria-disabled')).toBe('true')
    fireEvent.click(button)
    expect(press).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog', { name: 'Voice isn\'t set up' })).toBeTruthy()
  })

  it('adds nothing when there is no refusal', () => {
    const press = vi.fn()
    render(<IconButton onPress={press} />)
    const button = screen.getByRole('button', { name: 'Start voice' })
    expect(button.hasAttribute('aria-disabled')).toBe(false)
    expect(button.hasAttribute('aria-describedby')).toBe(false)
    fireEvent.click(button)
    expect(press).toHaveBeenCalledTimes(1)
  })

  it('rendered inside a form, its dialog\'s Close does not submit the form', () => {
    const submit = vi.fn((e: { preventDefault: () => void }) => e.preventDefault())
    function InForm() {
      const refused = useRefusal(NO_VOICE)
      return <form onSubmit={submit}><button type="submit" {...refused.props}>Send</button>{refused.dialog}</form>
    }
    render(<InForm />)
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(submit).not.toHaveBeenCalled()
  })
})
