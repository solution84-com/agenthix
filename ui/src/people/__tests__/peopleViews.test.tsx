import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { PersonProfileCardView } from '../PersonProfileCardView'
import type { PersonCardData } from '../types'

const card: PersonCardData = {
  person: { userId: 'u1', name: 'Dana', handle: 'dana', avatarUrl: null, state: 'active' },
  orgRole: 'MEMBER', timezone: null, viewerTimezone: null, sharedProjects: [], here: null, isMe: false, viewerIsOrgAdmin: false,
}

describe('the person profile card', () => {
  it('does not take focus back from the reader when its parent renders again', () => {
    function Host() {
      const [n, setN] = useState(0)
      return (
        <>
          <button type="button" onClick={() => setN(n + 1)}>rerender {n}</button>
          <PersonProfileCardView card={card} avatar={null} at={new Date()} onShowTasks={() => {}} onClose={() => {}} />
        </>
      )
    }
    render(<Host />)
    const tasks = screen.getByRole('button', { name: 'Show their tasks' })
    expect(document.activeElement).toBe(tasks)
    const outside = screen.getByRole('button', { name: /rerender/ })
    outside.focus()
    fireEvent.click(outside)
    expect(document.activeElement).toBe(outside)
  })

  it('is modal, takes focus without an action button, and holds Tab inside', () => {
    const onClose = vi.fn()
    render(<PersonProfileCardView card={card} avatar={null} at={new Date()} onManage={() => {}} onClose={onClose} />)
    const dialog = screen.getByRole('dialog')
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    expect(dialog.contains(document.activeElement)).toBe(true)
    fireEvent.keyDown(document, { key: 'Tab' })
    expect(dialog.contains(document.activeElement)).toBe(true)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })
})
