// @vitest-environment jsdom
/** Browsing knowledge (U2): the tree, the pages as items, the filters, Needs fixing, All pages. */
import './setup'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, within, cleanup } from '@testing-library/react'
import { data, history, ok, row, listOf, iso, setAddress, address, stubWidth } from './kit'
import { KnowledgeTool } from '../../KnowledgeTool'

const owner = { ownerType: 'project' as const, ownerId: 'p1' }
const decision = (n: string, status: string, days: number, over = {}) => row(`decisions/${n}.md`, {
  title: n, description: `About ${n}.`, tags: ['decision'], properties: { status, date: '2026-10-20' }, modifiedAt: iso(days),
  lastChange: { at: iso(days), by: { kind: 'agent', agentName: 'Kernel', forName: 'Sam' } }, ...over,
})
const pages = [
  decision('0002', 'accepted', 5),
  decision('0003', 'proposed', 0, { lastChange: { at: iso(0), by: { kind: 'person', name: 'Mia' } } }),
  row('decisions/0001-postgres.md', {
    title: '0001-postgres', tags: [], modifiedAt: iso(30),
    problems: [{ code: 'title_missing', field: 'title', message: 'title is missing' }],
  }),
  row('processes/release.md', { title: 'Release process', description: 'How we cut a release.', tags: ['releases'], modifiedAt: iso(2) }),
  row('glossary.md', { title: 'Glossary', description: 'Words we use.', modifiedAt: iso(9) }),
]

beforeEach(() => {
  vi.clearAllMocks()
  setAddress('tool=knowledge')
  data.useKnowledgePages.mockReturnValue(ok(listOf(pages)))
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('the Knowledge tool, wide @SC-1929', () => {
  beforeEach(() => stubWidth(900))

  it('shows the sections as a tree with their page counts, and a top-level page beside them @SC-1428', () => {
    render(<KnowledgeTool owner={owner} />)
    const tree = screen.getByRole('navigation', { name: 'Sections' })
    expect(within(tree).getByText('decisions').closest('button')?.textContent).toContain('3')
    expect(within(tree).getByText('processes')).toBeTruthy()
    expect(within(tree).getByText('Glossary')).toBeTruthy()
  })

  it('lists All pages newest first by default, headed Pages not Topics @SC-1428', () => {
    render(<KnowledgeTool owner={owner} />)
    expect(screen.queryByText('Topics')).toBeNull()
    const titles = screen.getAllByText(/^(0002|0003|0001-postgres|Release process|Glossary)$/).filter(e => !e.closest('nav')).map(e => e.textContent)
    expect(titles).toEqual(['0003', 'Release process', '0002', 'Glossary', '0001-postgres'])
  })

  it('shows a section’s pages as items: description, tags, properties, when and who @SC-1428', () => {
    render(<KnowledgeTool owner={owner} />)
    fireEvent.click(within(screen.getByRole('navigation', { name: 'Sections' })).getByText('decisions'))
    expect(address.params.get('section')).toBe('decisions')
    const item = screen.getByText('0002').closest('button') as HTMLElement
    expect(item.textContent).toContain('About 0002.')
    expect(item.textContent).toContain('decision')
    expect(item.textContent).toContain('status accepted')
    expect(item.textContent).toContain('date 2026-10-20')
    expect(item.textContent).toContain('Kernel, asked by Sam')
    expect((screen.getByText('0003').closest('button') as HTMLElement).textContent).toContain('Mia')
    expect(screen.queryByText('Release process')).toBeNull()
  })

  it('filters by Tag and by each property the listed pages use @SC-1428', () => {
    setAddress('tool=knowledge&section=decisions')
    render(<KnowledgeTool owner={owner} />)
    expect(screen.getByLabelText('status')).toBeTruthy()
    expect(screen.getByLabelText('date')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('status'), { target: { value: 'proposed' } })
    expect(screen.queryByText('0002')).toBeNull()
    expect(screen.getByText('0003')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('status'), { target: { value: '' } })
    fireEvent.change(screen.getByLabelText('Tag'), { target: { value: 'decision' } })
    expect(screen.queryByText('0001-postgres')).toBeNull()
    expect(screen.getByText('0002')).toBeTruthy()
  })

  it('builds no filter for a property nothing in the section uses @SC-1428', () => {
    setAddress('tool=knowledge&section=processes')
    render(<KnowledgeTool owner={owner} />)
    expect(screen.queryByLabelText('status')).toBeNull()
  })

  it('replaces the page list with the search while there is text in the box @SC-1426', () => {
    render(<KnowledgeTool owner={owner} />)
    expect(screen.getByText('Release process')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Search knowledge'), { target: { value: 'release' } })
    expect(screen.queryByText('Release process')).toBeNull()
    expect(screen.getByTestId('text-search')).toBeTruthy()
  })

  it('gathers pages with problems under Needs fixing, with the problems in place of the description @SC-1428', () => {
    render(<KnowledgeTool owner={owner} />)
    fireEvent.click(screen.getByRole('button', { name: /Needs fixing/ }))
    expect(address.params.get('view')).toBe('fix')
    const item = screen.getByText('0001-postgres').closest('button') as HTMLElement
    expect(item.textContent).toContain('title is missing')
    expect(screen.queryByText('Release process')).toBeNull()
  })

  it('says nothing needs fixing when nothing does @SC-1428', () => {
    data.useKnowledgePages.mockReturnValue(ok(listOf([pages[3]])))
    setAddress('tool=knowledge&view=fix')
    render(<KnowledgeTool owner={owner} />)
    expect(screen.getByText('Nothing needs fixing.')).toBeTruthy()
  })

  it('opens Recently deleted from its entry in the tree @SC-1428', () => {
    setAddress('tool=knowledge&view=deleted')
    render(<KnowledgeTool owner={owner} />)
    expect(screen.getByTestId('recently-deleted')).toBeTruthy()
    expect(history.useDeletedPages).toHaveBeenCalledWith(owner)
  })

  it('searches the pages\' text for what is typed, with the switch and each result marked by where it is from @SC-1426', async () => {
    data.useKnowledgeSearch.mockReturnValue(ok([{ level: 'project', page: 'processes/release.md', title: 'Release process', matches: [{ line: 3, text: 'Staging' }] }, { level: 'org', page: 'how-we-work/review.md', title: 'Review', matches: [] }]))
    render(<KnowledgeTool owner={owner} />)
    expect(screen.queryByTestId('text-search')).toBeNull()
    const withList = screen.getAllByText('All pages').length
    fireEvent.change(screen.getByLabelText('Search knowledge'), { target: { value: 'staging' } })
    // One list: the page list gives way to the search's results while there is text in the box.
    expect(screen.getAllByText('All pages').length).toBe(withList - 1)
    expect(screen.queryByText('No pages match.')).toBeNull()
    expect((await screen.findByTestId('text-search')).textContent).toContain('Both')
    expect(screen.getByRole('radio', { name: 'Both' }).getAttribute('aria-checked')).toBe('true')
    expect(screen.getAllByTestId('hit-from').map(e => e.textContent)).toEqual(['This project', 'Organisation'])
    await vi.waitFor(() => expect(data.useKnowledgeSearch).toHaveBeenCalledWith(owner, 'staging', 'both'))
    fireEvent.click(screen.getByRole('radio', { name: 'Organisation' }))
    expect(data.useKnowledgeSearch).toHaveBeenLastCalledWith(owner, 'staging', 'org')
  })

  it('shows the page list again when the search box is emptied @SC-1426', async () => {
    render(<KnowledgeTool owner={owner} />)
    const box = screen.getByLabelText('Search knowledge')
    const withList = screen.getAllByText('All pages').length
    fireEvent.change(box, { target: { value: 'staging' } })
    await screen.findByTestId('text-search')
    fireEvent.change(box, { target: { value: '' } })
    expect(screen.queryByTestId('text-search')).toBeNull()
    expect(screen.getAllByText('All pages').length).toBe(withList)
  })

  it('says what the place knows and that agents change it when asked, not that they add what they learn @SC-1428', () => {
    const { unmount } = render(<KnowledgeTool owner={owner} />)
    expect(screen.getByText(/^What this project knows, in pages and sections — processes, decisions, reference\. Agents look things up here when they need to, and change it when you ask\. Nothing here is read on every run: that is AGENTS\.md\.$/)).toBeTruthy()
    expect(screen.queryByText(/add what they learn/)).toBeNull()
    unmount()
    render(<KnowledgeTool owner={{ ownerType: 'user', ownerId: 'u1' }} personal />)
    expect(screen.getByText(/^What your space knows, in pages and sections/)).toBeTruthy()
  })

  it('has no switch in the organisation\'s own place, and says how the organisation\'s knowledge works @SC-1426 @SC-1428', () => {
    render(<KnowledgeTool owner={{ ownerType: 'org' }} />)
    expect(screen.getByText(/organisation admins change it, or ask an agent to/)).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Search knowledge'), { target: { value: 'x' } })
    expect(screen.queryByRole('radiogroup')).toBeNull()
  })

  it('offers New page and New section only to those who may change the place @SC-1428', () => {
    const { unmount } = render(<KnowledgeTool owner={owner} />)
    expect(screen.getByRole('button', { name: 'New page' })).toBeTruthy()
    unmount()
    data.useKnowledgePages.mockReturnValue(ok(listOf(pages, { canChange: false })))
    render(<KnowledgeTool owner={owner} />)
    expect(screen.queryByRole('button', { name: 'New page' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'More actions' })).toBeNull()
  })

  it('names a new section and then opens the editor in it @SC-1428', () => {
    render(<KnowledgeTool owner={owner} />)
    fireEvent.click(screen.getByRole('button', { name: 'More actions' }))
    fireEvent.click(screen.getByText('New section'))
    fireEvent.change(screen.getByPlaceholderText('decisions'), { target: { value: 'clients' } })
    fireEvent.click(screen.getByRole('button', { name: 'Write its first page' }))
    expect((screen.getByLabelText('Section') as HTMLInputElement).value).toBe('clients')
  })

  it('says why a list could not be read @SC-1428', () => {
    // A final answer: in place of the list, in its own words, without Try again or a dialog.
    data.useKnowledgePages.mockReturnValue({ data: undefined, isLoading: false, error: Object.assign(new Error('You may not read this place’s knowledge.'), { statusCode: 403 }), refetch: vi.fn(), dataUpdatedAt: 0 })
    render(<KnowledgeTool owner={owner} />)
    expect(screen.getByRole('status').textContent).toContain('You may not read')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull()
  })

  it('says the place has nothing yet @SC-1428', () => {
    data.useKnowledgePages.mockReturnValue(ok(listOf([])))
    render(<KnowledgeTool owner={owner} />)
    expect(screen.getByText(/Nothing is known here yet/)).toBeTruthy()
  })
})

describe('the Knowledge tool, on a phone @SC-1428', () => {
  it('shows one level at a time: sections first, then a section’s pages with a way back', () => {
    render(<KnowledgeTool owner={owner} />)
    expect(screen.getByText('decisions').closest('button')?.textContent).toContain('3 pages')
    expect(screen.queryByText('About 0002.')).toBeNull()
    fireEvent.click(screen.getByText('decisions'))
    expect(screen.getByText('About 0002.')).toBeTruthy()
    expect(screen.queryByText('Release process')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Knowledge/ }))
    expect(screen.getByText('processes')).toBeTruthy()
  })
})
