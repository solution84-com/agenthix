// @vitest-environment jsdom
import React from 'react'
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { NeedsYouBar, NeedsYouBars } from '../NeedsYouBar'

afterEach(cleanup)

describe('the Needs-you bar', () => {
  it('shows the agent with its Needs-you ring, the task, what it waits for and the one answer', () => {
    render(
      <NeedsYouBar
        agentName="Reviewer" avatar={<span>R</span>} why="needs Kai’s okay"
        taskKey="WEB-81" title="Spell-check the case studies" detail="· needs Kai’s okay: asks to commit 4 fixes"
        action={<button type="button">Review</button>}
      />,
    )
    const avatar = screen.getByRole('img', { name: 'Reviewer · Needs you · needs Kai’s okay' })
    expect(avatar.getAttribute('data-run')).toBe('NEEDS_YOU')
    expect(screen.getByText('WEB-81')).toBeTruthy()
    expect(screen.getByText('Spell-check the case studies')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Review' })).toBeTruthy()
  })

  it('draws no group when nothing waits', () => {
    const { container } = render(<NeedsYouBars>{[false, null]}</NeedsYouBars>)
    expect(container.firstChild).toBeNull()
  })
})
