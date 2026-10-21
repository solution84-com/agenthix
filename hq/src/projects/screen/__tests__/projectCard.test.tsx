// @vitest-environment jsdom
import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react'
import { ProjectCard } from '@agenthix/ui/projects'

afterEach(cleanup)

describe('a project card’s boards link @SC-656', () => {
  const card = (onOpenBoards?: () => void, notJoined = false) => (
    <ProjectCard as="a" href="/projects/WEB" project={{ id: 'p1', name: 'Website', boardCount: 4, totalTaskCount: 50, doneTaskCount: 12, onOpenBoards, notJoined }} />
  )

  it('opens the boards without following the card', () => {
    const open = vi.fn()
    const follow = vi.fn((e: Event) => e.preventDefault())
    document.addEventListener('click', follow)
    render(card(open))
    fireEvent.click(within(screen.getByTestId('place-card')).getByRole('link', { name: '4 boards' }))
    document.removeEventListener('click', follow)
    expect(open).toHaveBeenCalledOnce()
    expect(follow).toHaveBeenCalledTimes(0)
  })

  it('is plain text when there is nothing to open, and on a project not joined', () => {
    const { unmount } = render(card())
    expect(within(screen.getByTestId('place-card')).queryByRole('link', { name: '4 boards' })).toBeNull()
    unmount()
    render(card(vi.fn(), true))
    expect(screen.queryByRole('link', { name: '4 boards' })).toBeNull()
  })
})
