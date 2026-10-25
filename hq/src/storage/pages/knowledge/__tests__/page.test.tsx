// @vitest-environment jsdom
/** A page (U3): how it reads, its links, Linked from, and what a person who may not change the place sees. */
import './setup'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react'
import { data, history, ok, row, listOf, iso, setAddress, address, stubWidth } from './kit'
import { KnowledgeTool } from '../../KnowledgeTool'

const owner = { ownerType: 'project' as const, ownerId: 'p1' }
const TEXT = [
  '---', 'title: Release process', 'description: How we cut a release.', 'tags: [releases]', 'status: accepted', '---',
  '## Cutting a release', 'Run the checks. See [the glossary](../glossary.md) and [the code review](org:how-we-work/code-review.md).',
  '', '## Staging', 'Needs [a missing page](gone.md) and [another place](shop:notes/a.md) approval.', '', '```', '## not a heading', '```',
].join('\n')
const release = row('processes/release.md', {
  title: 'Release process', description: 'How we cut a release.', tags: ['releases'], properties: { status: 'accepted' },
  lastChange: { at: iso(0), by: { kind: 'agent', agentName: 'Kernel', forName: 'Sam', conversationId: 'c-9' } },
  problems: [{ code: 'link_broken', field: 'links', line: 9, message: "the link to 'gone.md' leads to no page" }],
})
const pages = [release, row('glossary.md', { title: 'Glossary' }), row('processes/staging.md', { title: 'Staging approvals' })]

beforeEach(() => {
  vi.clearAllMocks()
  setAddress('tool=knowledge&page=processes/release.md')
  stubWidth(900)
  data.useKnowledgePages.mockReturnValue(ok(listOf(pages)))
  data.useKnowledgePageContent.mockReturnValue(ok({ page: 'processes/release.md', content: TEXT, version: 'v1', linkedFrom: ['processes/staging.md'], lastChange: release.lastChange }))
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('a page, read', () => {
  it('shows its title, description, tags, properties and who changed it, linked to the conversation @SC-1429', () => {
    render(<KnowledgeTool owner={owner} />)
    expect(screen.getByText('Release process')).toBeTruthy()
    expect(screen.getByText('How we cut a release.')).toBeTruthy()
    expect(screen.getByText('releases')).toBeTruthy()
    expect(screen.getByText('accepted').closest('span')?.textContent).toContain('status')
    const who = screen.getByRole('link', { name: 'Kernel, asked by Sam' })
    expect(who.getAttribute('href')).toBe('/chat/t/c-9')
  })

  it('renders the Markdown without its front matter, with On this page listing the headings but not code @SC-1429', () => {
    render(<KnowledgeTool owner={owner} />)
    expect(screen.getByRole('heading', { name: 'Cutting a release' })).toBeTruthy()
    expect(screen.queryByText(/title: Release process/)).toBeNull()
    const nav = screen.getByRole('navigation', { name: 'On this page' })
    expect(nav.textContent).toContain('Cutting a release')
    expect(nav.textContent).toContain('Staging')
    expect(nav.textContent).not.toContain('not a heading')
  })

  it('opens a linked page of the same place when its link is clicked @SC-1429', () => {
    render(<KnowledgeTool owner={owner} />)
    fireEvent.click(screen.getByRole('link', { name: 'the glossary' }))
    expect(address.params.get('page')).toBe('glossary.md')
  })

  it('opens an org: link in the organisation’s Knowledge @SC-1429', () => {
    const open = vi.fn()
    render(<KnowledgeTool owner={owner} onOpenOrgPage={open} />)
    fireEvent.click(screen.getByRole('link', { name: 'the code review' }))
    expect(open).toHaveBeenCalledWith('how-we-work/code-review.md')
  })

  it('says a link to another place’s page, or to no page, is not opened @SC-1429', () => {
    render(<KnowledgeTool owner={owner} />)
    fireEvent.click(screen.getByRole('link', { name: 'a missing page' }))
    expect(screen.getByRole('status').textContent).toContain('leads to no page')
    expect(address.params.get('page')).toBe('processes/release.md')
    fireEvent.click(screen.getByRole('link', { name: 'another place' }))
    expect(screen.getByRole('status').textContent).toContain('shop:notes/a.md')
  })

  it('shows a broken link as a problem above the text @SC-1429', () => {
    render(<KnowledgeTool owner={owner} />)
    expect(screen.getAllByRole('alert')[0].textContent).toContain("the link to 'gone.md' leads to no page")
  })

  it('lists the pages that link here under the text, and opens one @SC-1429', () => {
    render(<KnowledgeTool owner={owner} />)
    const section = screen.getByRole('region', { name: 'Linked from' })
    fireEvent.click(section.querySelector('button') as HTMLElement)
    expect(address.params.get('page')).toBe('processes/staging.md')
  })

  it('offers Edit, Mention, Move and Delete to those who may change the place @SC-1429', () => {
    render(<KnowledgeTool owner={owner} />)
    expect(screen.getByRole('button', { name: 'Edit' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Mention' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'More actions' }))
    expect(screen.getByText('Move…')).toBeTruthy()
    expect(screen.getByText('Delete')).toBeTruthy()
  })

  it('offers only Mention, History and Download to those who may not @SC-1429', () => {
    data.useKnowledgePages.mockReturnValue(ok(listOf(pages, { canChange: false })))
    render(<KnowledgeTool owner={owner} />)
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Mention' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'History' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'More actions' }))
    expect(screen.getByText('Download')).toBeTruthy()
    expect(screen.queryByText('Move…')).toBeNull()
    expect(screen.queryByText('Delete')).toBeNull()
  })

  it('opens History for the page, at the version the address names @SC-1425', () => {
    render(<KnowledgeTool owner={owner} />)
    fireEvent.click(screen.getByRole('button', { name: 'History' }))
    expect(address.params.get('view')).toBe('history')
    expect(screen.getByTestId('page-history')).toBeTruthy()
    expect(history.useVersionRows).toHaveBeenCalledWith(owner, 'processes/release.md')
  })

  it('opens History from a work step\'s address, named by its version, and back to the page @SC-1416 @SC-1425', () => {
    setAddress('tool=knowledge&page=processes/release.md&view=history&history=v7')
    render(<KnowledgeTool owner={owner} />)
    expect(screen.getByTestId('page-history')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /processes\/release\.md/ }))
    expect(address.params.get('view')).toBeNull()
    expect(address.params.get('history')).toBeNull()
  })

  it('moves a page to another section from the version it was read at @SC-1422', async () => {
    data.moveKnowledge.mockResolvedValue({ outcome: 'done', page: 'archive/release.md', change: 'moved' })
    render(<KnowledgeTool owner={owner} />)
    fireEvent.click(screen.getByRole('button', { name: 'More actions' }))
    fireEvent.click(screen.getByText('Move…'))
    fireEvent.change(screen.getByLabelText('To another section'), { target: { value: 'archive' } })
    fireEvent.click(screen.getByRole('button', { name: 'Move' }))
    await vi.waitFor(() => expect(address.params.get('page')).toBe('archive/release.md'))
    expect(data.moveKnowledge).toHaveBeenCalledWith({ owner, from: 'processes/release.md', to: 'archive/release.md', baseVersion: 'v1' })
  })

  it('deletes a page after asking, and goes back to the list @SC-1423', async () => {
    data.deleteKnowledge.mockResolvedValue({ outcome: 'done', page: 'processes/release.md', change: 'deleted' })
    render(<KnowledgeTool owner={owner} />)
    fireEvent.click(screen.getByRole('button', { name: 'More actions' }))
    fireEvent.click(screen.getByText('Delete'))
    expect(screen.getByText(/kept for 30 days in Recently deleted/)).toBeTruthy()
    expect(data.deleteKnowledge).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Delete page' }))
    await vi.waitFor(() => expect(address.params.get('page')).toBeNull())
    expect(data.deleteKnowledge).toHaveBeenCalledWith({ owner, page: 'processes/release.md' })
  })

  it('leaves the page at once for its section, saying it went to Recently deleted, with a way there @SC-1423', async () => {
    data.deleteKnowledge.mockResolvedValue({ outcome: 'done', page: 'processes/release.md', change: 'deleted' })
    render(<KnowledgeTool owner={owner} />)
    fireEvent.click(screen.getByRole('button', { name: 'More actions' }))
    fireEvent.click(screen.getByText('Delete'))
    fireEvent.click(screen.getByRole('button', { name: 'Delete page' }))
    await vi.waitFor(() => expect(address.params.get('page')).toBeNull())
    expect(address.params.get('view')).toBe('section')
    expect(address.params.get('section')).toBe('processes')
    expect(screen.getByRole('status').textContent).toBe('Deleted Release process. It is kept for 30 days in Recently deleted.')
    fireEvent.click(within(screen.getByRole('status')).getByRole('button', { name: 'Recently deleted' }))
    expect(address.params.get('view')).toBe('deleted')
    expect(screen.queryByText(/It is kept for 30 days in/)).toBeNull()
  })

  it('shows a refused delete in the gate’s words and keeps the page @SC-1423', async () => {
    data.deleteKnowledge.mockResolvedValue({ outcome: 'refused', reason: 'not_found', message: 'There is no such page. Nothing was changed.' })
    render(<KnowledgeTool owner={owner} />)
    fireEvent.click(screen.getByRole('button', { name: 'More actions' }))
    fireEvent.click(screen.getByText('Delete'))
    fireEvent.click(screen.getByRole('button', { name: 'Delete page' }))
    await vi.waitFor(() => expect(screen.getAllByRole('alert').map(a => a.textContent).join()).toContain('Nothing was changed.'))
    expect(address.params.get('page')).toBe('processes/release.md')
  })
})
