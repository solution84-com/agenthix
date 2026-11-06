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
    expect(truncated).toEqual(expect.arrayContaining([expect.stringContaining('A very long'), expect.stringContaining('Writer: A long'), 'Website relaunch']))
    for (const e of button.querySelectorAll('.truncate')) expect(e.closest('.min-w-0')).not.toBeNull()
  })

  it('shows working as a dot on the face and never as an outline', () => {
    render(<ul><InboxRow conversation={row({ working: true })} open={false} onChoose={() => {}} /></ul>)
    expect(screen.getByTestId('working-dot')).toBeTruthy()
    expect(screen.getByTestId('inbox-row').outerHTML).not.toMatch(/outline/)
  })
})
