// @vitest-environment jsdom
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

vi.mock('react-router', () => ({ Link: ({ to, children, ...rest }: { to: string; children: React.ReactNode }) => <a href={to} {...rest}>{children}</a> }))

import { ConversationMenu } from '../ConversationMenu'
import { ConversationHeaderTools } from '../ConversationHeaderTools'

afterEach(cleanup)
const entries = () => Array.from(screen.getByRole('menu').querySelectorAll<HTMLElement>('[role^="menuitem"]'))

describe('the conversation menu', () => {
  it('keeps a conversation out of archiving, or lets idle archiving take it again @SC-974', () => {
    const onToggleKeep = vi.fn()
    const { rerender } = render(<ConversationMenu busy={false} keep={false} onToggleKeep={onToggleKeep} />)
    fireEvent.click(screen.getByRole('button', { name: 'Conversation menu' }))
    fireEvent.click(screen.getByRole('menuitemcheckbox', { name: /^Keep it/ }))
    expect(onToggleKeep).toHaveBeenCalled()
    rerender(<ConversationMenu busy={false} keep onToggleKeep={onToggleKeep} />)
    fireEvent.click(screen.getByRole('button', { name: 'Conversation menu' }))
    expect(screen.getByRole('menuitemcheckbox', { name: /^Keep it/ }).getAttribute('aria-checked')).toBe('true')
  })

  it('opens the Runs screen on this conversation @SC-973', () => {
    render(<ConversationMenu busy={false} runsHref="/runs?conversation=c1" />)
    fireEvent.click(screen.getByRole('button', { name: 'Conversation menu' }))
    expect(screen.getByRole('menuitem', { name: 'Show its runs' }).getAttribute('href')).toBe('/runs?conversation=c1')
  })

  it('lists Rename, Summarise now, Show its runs, Keep it, Archive and Delete…, each with an icon, in that order', () => {
    render(<ConversationMenu busy={false} onRename={vi.fn()} onSummarise={vi.fn()} runsHref="/runs?conversation=c1" keep={false} onToggleKeep={vi.fn()} onArchive={vi.fn()} onDelete={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Conversation menu' }))
    const items = entries()
    expect(items.map((i) => i.querySelector('span:not([aria-hidden]) > span')?.textContent)).toEqual(
      ['Rename', 'Summarise now', 'Show its runs', 'Keep it', 'Archive', 'Delete…'],
    )
    for (const item of items) expect(item.querySelector('svg')).toBeTruthy()
  })

  it('gives a short line to Summarise now and Keep it only', () => {
    render(<ConversationMenu busy={false} onRename={vi.fn()} onSummarise={vi.fn()} runsHref="/r" keep={false} onToggleKeep={vi.fn()} onArchive={vi.fn()} onDelete={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Conversation menu' }))
    const withLine = entries().filter((i) => i.querySelectorAll('.text-micro').length > 0)
    expect(withLine.map((i) => i.textContent)).toEqual([
      'Summarise nowFolds the older messages into a short summary', 'Keep itKeeps it out of archiving when idle',
    ])
  })

  it('runs Rename, Archive and Delete…, closing the menu', () => {
    const [onRename, onArchive, onDelete] = [vi.fn(), vi.fn(), vi.fn()]
    render(<ConversationMenu busy={false} onRename={onRename} onArchive={onArchive} onDelete={onDelete} />)
    for (const [name, fn] of [['Rename', onRename], ['Archive', onArchive], ['Delete…', onDelete]] as const) {
      fireEvent.click(screen.getByRole('button', { name: 'Conversation menu' }))
      fireEvent.click(screen.getByRole('menuitem', { name }))
      expect(fn).toHaveBeenCalledTimes(1)
      expect(screen.queryByRole('menu')).toBeNull()
    }
  })

  it('closes on Escape', () => {
    render(<ConversationMenu busy={false} onRename={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Conversation menu' }))
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('shows the menu in the header, visible without hover, whenever it has an entry @SC-1012', () => {
    render(<ConversationHeaderTools canDelete={false} onDelete={vi.fn()} runsHref="/runs?conversation=c1" />)
    expect(screen.getByRole('button', { name: 'Conversation menu' })).toBeTruthy()
  })

  it('holds Delete… in the menu, not beside it @SC-1012', () => {
    const onDelete = vi.fn()
    render(<ConversationHeaderTools canDelete onDelete={onDelete} />)
    expect(screen.queryByRole('button', { name: /^Delete/ })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Conversation menu' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete…' }))
    expect(onDelete).toHaveBeenCalled()
  })

  it('offers Rename only to a person who may change the conversation', () => {
    const { rerender } = render(<ConversationHeaderTools canDelete={false} onDelete={vi.fn()} canRename onRename={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Conversation menu' }))
    expect(screen.getByRole('menuitem', { name: 'Rename' })).toBeTruthy()
    rerender(<ConversationHeaderTools canDelete={false} onDelete={vi.fn()} canRename={false} onRename={vi.fn()} runsHref="/r" />)
    expect(screen.queryByRole('menuitem', { name: 'Rename' })).toBeNull()
  })

  it('puts Over the page first, reading Back beside the page while over it, and switches the placement @SC-1032', () => {
    const onToggle = vi.fn()
    const { rerender } = render(<ConversationMenu busy={false} onRename={vi.fn()} panel={{ over: false, refused: null, onToggle }} />)
    fireEvent.click(screen.getByRole('button', { name: 'Conversation menu' }))
    expect(entries().map((i) => i.textContent)).toEqual(['Over the page', 'Rename'])
    fireEvent.click(screen.getByRole('menuitem', { name: 'Over the page' }))
    expect(onToggle).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('menu')).toBeNull()
    rerender(<ConversationMenu busy={false} onRename={vi.fn()} panel={{ over: true, refused: null, onToggle }} />)
    fireEvent.click(screen.getByRole('button', { name: 'Conversation menu' }))
    expect(screen.getByRole('menuitem', { name: 'Back beside the page' })).toBeTruthy()
    expect(screen.queryByRole('menuitem', { name: 'Over the page' })).toBeNull()
  })

  it('greys Over the page with the reason in its tooltip while a file is open @SC-1032 @SC-1875', () => {
    const onToggle = vi.fn()
    render(<ConversationMenu busy={false} panel={{ over: false, refused: 'Close the file to put the chat over the page.', onToggle }} />)
    fireEvent.click(screen.getByRole('button', { name: 'Conversation menu' }))
    const entry = screen.getByRole('menuitem', { name: 'Over the page' }) as HTMLButtonElement
    expect(entry.disabled).toBe(true)
    expect(entry.title).toBe('Close the file to put the chat over the page.')
    fireEvent.click(entry)
    expect(onToggle).not.toHaveBeenCalled()
  })

  it('shows the menu for the panel entry alone, and without it when there is no panel entry @SC-1032', () => {
    const { rerender } = render(<ConversationHeaderTools canDelete={false} onDelete={vi.fn()} panel={{ over: false, refused: null, onToggle: vi.fn() }} />)
    expect(screen.getByRole('button', { name: 'Conversation menu' })).toBeTruthy()
    rerender(<ConversationHeaderTools canDelete={false} onDelete={vi.fn()} />)
    expect(screen.queryByRole('button', { name: 'Conversation menu' })).toBeNull()
  })
})
