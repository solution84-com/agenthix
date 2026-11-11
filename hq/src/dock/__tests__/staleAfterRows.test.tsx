// @vitest-environment jsdom
/** The "Not up to date" line is after the last row, so it never moves a row the person is reaching for. */
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { fake, resetFake, row, setInbox } from './dockFakes'

vi.mock('../useConversationInbox', () => ({
  useConversationInbox: () => ({ inbox: fake.inbox, loaded: true, stale: <p data-testid="stale">Not up to date</p> }),
}))
vi.mock('../../shared/components/AuthedAgentAvatar', () => ({ AuthedAgentAvatar: () => <i /> }))

import { DockConversationList } from '../DockConversationList'
import { DockPlaceConversations } from '../DockPlaceConversations'

beforeEach(() => { resetFake(); setInbox([row('c1'), row('c2')]) })
afterEach(cleanup)

const after = (a: Element, b: Element) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)

describe('the dock\'s lists of conversations @SC-1004 @SC-1930', () => {
  it('put the stale line after the last row', () => {
    const view = { filters: { needsYou: false, unread: false }, setFilters: () => {}, search: '', setSearch: () => {} }
    render(<MemoryRouter><DockConversationList view={view as never} openId={null} onChoose={() => {}} onGo={() => {}} /></MemoryRouter>)
    const rows = screen.getAllByTestId('inbox-row')
    expect(after(rows[rows.length - 1]!, screen.getByTestId('stale'))).toBe(true)
  })

  it('put it after the last row in a place\'s list too', () => {
    const place = { placeId: null, name: 'Your space', href: '/', basePath: '/chat' }
    render(<MemoryRouter><DockPlaceConversations place={place as never} openId={null} onChoose={() => {}} onNew={() => {}} onGo={() => {}} /></MemoryRouter>)
    const rows = screen.getAllByTestId('inbox-row')
    expect(after(rows[rows.length - 1]!, screen.getByTestId('stale'))).toBe(true)
  })
})
