// @vitest-environment jsdom
/** A row's lines end with … inside the list: the button is as wide as the list, not as wide as its text. */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import type { InboxConversation } from '../../shared/conversations/inbox'
import { InboxRow } from '../InboxRow'

vi.mock('../../shared/components/AuthedAgentAvatar', () => ({ AuthedAgentAvatar: () => <span /> }))

const row = (over: Partial<InboxConversation> = {}): InboxConversation => ({
  id: 'c1', title: 'A very long conversation title that goes on and on', status: 'OPEN', lastMessageAt: new Date().toISOString(),
  lastLine: { by: 'agent', text: 'A long last message '.repeat(10) }, unread: 0, needsYou: 0, working: false,
  agent: { id: 'a1', name: 'Writer', avatarUrl: null }, place: { kind: 'project', id: 'p1', name: 'Website relaunch', key: 'WEB' },
  ...over,
} as unknown as InboxConversation)

afterEach(cleanup)

describe('InboxRow', () => {
  it('fills the width of its list and truncates every line', () => {
    render(<ul><InboxRow conversation={row()} open={false} onChoose={() => {}} /></ul>)
    const button = screen.getByTestId('inbox-row')
    expect(button.className).toMatch(/\bw-full\b/)
    expect(button.className).toMatch(/\bmin-w-0\b/)
    expect(button.parentElement!.className).toContain('min-w-0')
    const truncated = Array.from(button.querySelectorAll('.truncate')).map((e) => e.textContent)
    expect(truncated).toEqual(expect.arrayContaining([expect.stringContaining('A very long'), expect.stringContaining('Writer: A long')]))
    for (const e of button.querySelectorAll('.truncate')) expect(e.closest('.min-w-0')).not.toBeNull()
  })

  it('shows working as a dot on the face and never as an outline', () => {
    render(<ul><InboxRow conversation={row({ working: true })} open={false} onChoose={() => {}} /></ul>)
    expect(screen.getByTestId('working-dot')).toBeTruthy()
    expect(screen.getByTestId('inbox-row').outerHTML).not.toMatch(/outline/)
  })

  it('is two lines: the place is a tile on the avatar named in its tooltip, not a line of text', () => {
    render(<ul><InboxRow conversation={row()} open={false} onChoose={() => {}} /></ul>)
    const button = screen.getByTestId('inbox-row')
    expect(screen.getByTestId('place-tile').getAttribute('title')).toBe('Website relaunch')
    expect(button.textContent).not.toContain('Website relaunch')
    expect(button.querySelectorAll('.truncate')).toHaveLength(2)
    expect(button.getAttribute('aria-label')).toContain('Website relaunch')
  })

  it('shows unread as a count at the right, the title bold and the time in the accent colour', () => {
    render(<ul><InboxRow conversation={row({ unread: 3 })} open={false} onChoose={() => {}} /></ul>)
    expect(screen.getByTestId('unread-count').textContent).toBe('3')
    const title = screen.getByText(/A very long conversation title/)
    expect(title.className).toMatch(/font-semibold/)
    expect(title.nextElementSibling!.className).toMatch(/text-accent/)
  })

  it('shows a read row plainly, and one that needs the person with !', () => {
    const { unmount } = render(<ul><InboxRow conversation={row()} open={false} onChoose={() => {}} /></ul>)
    expect(screen.queryByTestId('unread-count')).toBeNull()
    expect(screen.getByText(/A very long conversation title/).className).not.toMatch(/font-semibold/)
    unmount()
    render(<ul><InboxRow conversation={row({ needsYou: 1, unread: 2 })} open={false} onChoose={() => {}} /></ul>)
    expect(screen.getByTestId('needs-mark').textContent).toBe('!')
  })

  it('marks the open row with an accent bar at its left', () => {
    const { unmount } = render(<ul><InboxRow conversation={row()} open={false} onChoose={() => {}} /></ul>)
    expect(screen.queryByTestId('open-bar')).toBeNull()
    unmount()
    render(<ul><InboxRow conversation={row()} open onChoose={() => {}} /></ul>)
    expect(screen.getByTestId('open-bar')).toBeTruthy()
  })

  it('leaves the tile out where the list is one place’s', () => {
    render(<ul><InboxRow conversation={row()} open={false} showPlace={false} onChoose={() => {}} /></ul>)
    expect(screen.queryByTestId('place-tile')).toBeNull()
  })
})
