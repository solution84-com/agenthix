// @vitest-environment jsdom
/** The floating box's rule: drawn only while the chat is minimised, or where there is no chat panel at all. */
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

const h = vi.hoisted(() => ({ dock: null as null | { position: string } }))
vi.mock('../../../dock/DockContext', () => ({ useDock: () => h.dock }))
vi.mock('../../../chat/chatComposer', () => ({
  useChatComposerPlace: () => ({ basePath: '/chat', composerPlaceholder: 'Ask any agent…', noAgentsNotice: 'None' }),
}))
vi.mock('../NewConversationBox', () => ({
  NewConversationBox: (p: { home: string; basePath: string; autoFocus?: boolean }) => <div data-testid="box" data-home={p.home} data-base={p.basePath} data-focus={String(!!p.autoFocus)} />,
}))

import { FloatingComposer, showsFloatingComposer, WithFloatingComposer } from '../FloatingComposer'

afterEach(cleanup)

describe('when the floating box shows', () => {
  it('shows only while minimised, or with no chat panel', () => {
    expect(showsFloatingComposer({ position: 'collapsed' } as never)).toBe(true)
    expect(showsFloatingComposer({ position: 'docked' } as never)).toBe(false)
    expect(showsFloatingComposer({ position: 'expanded' } as never)).toBe(false)
    expect(showsFloatingComposer(null)).toBe(true)
  })

  it('is the chat’s own box, starting a conversation in your space under Chat, without taking focus', () => {
    h.dock = { position: 'collapsed' }
    render(<FloatingComposer />)
    expect(screen.getByTestId('box').dataset).toMatchObject({ home: 'PERSON', base: '/chat', focus: 'false' })
  })

  it('floats over the page’s foot rather than taking room from it', () => {
    h.dock = { position: 'collapsed' }
    render(<WithFloatingComposer><main>the page</main></WithFloatingComposer>)
    const box = screen.getByTestId('floating-composer')
    expect(box.parentElement!.className).toContain('absolute')
    expect(screen.getByText('the page').parentElement).toBe(box.parentElement!.parentElement)
  })

  it('leaves nothing behind while the chat is beside the page', () => {
    h.dock = { position: 'docked' }
    const { container } = render(<FloatingComposer />)
    expect(container.textContent).toBe('')
  })
})
