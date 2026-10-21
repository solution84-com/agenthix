// @vitest-environment jsdom
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

vi.mock('react-router', () => ({ Link: ({ to, children, ...rest }: { to: string; children: React.ReactNode }) => <a href={to} {...rest}>{children}</a> }))

import { ConversationMenu } from '../ConversationMenu'
import { ConversationHeaderTools } from '../ConversationHeaderTools'

afterEach(cleanup)

describe('the conversation menu', () => {
  it('keeps a conversation out of archiving, or lets idle archiving take it again @SC-974', () => {
    const onToggleKeep = vi.fn()
    const { rerender } = render(<ConversationMenu busy={false} keep={false} onToggleKeep={onToggleKeep} />)
    fireEvent.click(screen.getByRole('button', { name: 'Conversation menu' }))
    fireEvent.click(screen.getByRole('menuitemcheckbox', { name: 'Keep out of archiving' }))
    expect(onToggleKeep).toHaveBeenCalled()
    rerender(<ConversationMenu busy={false} keep onToggleKeep={onToggleKeep} />)
    fireEvent.click(screen.getByRole('button', { name: 'Conversation menu' }))
    expect(screen.getByRole('menuitemcheckbox', { name: 'Allow archiving when idle' }).getAttribute('aria-checked')).toBe('true')
  })

  it('opens the Runs screen on this conversation @SC-973', () => {
    render(<ConversationMenu busy={false} runsHref="/runs?conversation=c1" />)
    fireEvent.click(screen.getByRole('button', { name: 'Conversation menu' }))
    expect(screen.getByRole('menuitem', { name: 'Show its runs' }).getAttribute('href')).toBe('/runs?conversation=c1')
  })

  it('shows the menu in the header, visible without hover, whenever it has an entry @SC-1012', () => {
    render(<ConversationHeaderTools canDelete={false} onDelete={vi.fn()} runsHref="/runs?conversation=c1" />)
    expect(screen.getByRole('button', { name: 'Conversation menu' })).toBeTruthy()
  })
})
