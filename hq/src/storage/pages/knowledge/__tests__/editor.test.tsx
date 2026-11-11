// @vitest-environment jsdom
/** The editor (U3): fields, properties offered from the section, problems on their field, and a conflict. */
import './setup'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { data, ok, row, listOf, iso, setAddress, address, stubWidth } from './kit'
import type { SiteFileRef } from '@agenthix/core'
import { KnowledgeTool } from '../../KnowledgeTool'
import { createEmbedBatch } from '../../../../shared/components/markdownEmbed/embedBatch'
import { EmbedBatchContext } from '../../../../shared/components/markdownEmbed/useEmbedAnswer'

const owner = { ownerType: 'project' as const, ownerId: 'p1' }
const TEXT = '---\ntitle: Staging needs an approval\ndescription: Who signs off.\ntags: [decision]\nstatus: proposed\n---\n## Context\nChecks failed twice.\n'
const pages = [
  row('decisions/0002.md', { title: 'One repository', properties: { status: 'accepted', date: '2026-10-20' } }),
  row('decisions/0003.md', { title: 'Staging needs an approval', properties: { status: 'proposed', date: '2026-10-25' } }),
  row('processes/release.md', { title: 'Release process', properties: { owner: 'Mia' } }),
]

beforeEach(() => {
  vi.clearAllMocks()
  setAddress('tool=knowledge&section=decisions')
  stubWidth(900)
  data.useKnowledgePages.mockReturnValue(ok(listOf(pages)))
  data.useKnowledgePageContent.mockReturnValue(ok({ page: 'decisions/0003.md', content: TEXT, version: 'v1', linkedFrom: [] }))
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

const newPage = () => { render(<KnowledgeTool owner={owner} />); fireEvent.click(screen.getByRole('button', { name: 'New page' })) }
const type = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } })

describe('a new page @SC-1430', () => {
  it('opens in the section shown, with the properties its other pages use already offered', () => {
    newPage()
    expect((screen.getByLabelText('Section') as HTMLInputElement).value).toBe('decisions')
    const names = screen.getAllByLabelText('Property name').map(i => (i as HTMLInputElement).value)
    expect(names.sort()).toEqual(['date', 'status'])
    expect(screen.queryByDisplayValue('owner')).toBeNull()
  })

  it('shows a problem on its field when the person has typed one, and none for what is not yet written', () => {
    newPage()
    expect(screen.queryAllByRole('alert')).toHaveLength(0)
    type('Title', 'x'.repeat(130))
    expect(screen.getByRole('alert').textContent).toContain('title is 130 characters; it may be up to 120')
  })

  it('refuses a save with a field in words, and does not send it', async () => {
    newPage()
    type('Title', 'Deploys')
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(screen.getByText('description is missing')).toBeTruthy()
    expect(data.saveKnowledge).not.toHaveBeenCalled()
  })

  it('saves the whole page with its front matter, named from the title, and opens it', async () => {
    data.saveKnowledge.mockResolvedValue({ outcome: 'done', page: 'decisions/deploys-need-a-check.md', change: 'created', version: 'v9' })
    newPage()
    type('Title', 'Deploys need a check')
    type('Description', 'Why every deploy is checked.')
    fireEvent.change(screen.getByLabelText('Add a tag'), { target: { value: 'decision' } })
    fireEvent.keyDown(screen.getByLabelText('Add a tag'), { key: 'Enter' })
    fireEvent.change(screen.getAllByLabelText(/Value of status/)[0], { target: { value: 'proposed' } })
    fireEvent.change(screen.getByLabelText('Text'), { target: { value: '## Why\nBecause.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await vi.waitFor(() => expect(address.params.get('page')).toBe('decisions/deploys-need-a-check.md'))
    const sent = data.saveKnowledge.mock.calls[0][0]
    expect(sent).toMatchObject({ owner, page: 'decisions/deploys-need-a-check.md', baseVersion: null })
    expect(sent.content).toBe('---\ntitle: Deploys need a check\ndescription: Why every deploy is checked.\ntags: [decision]\nstatus: proposed\n---\n## Why\nBecause.\n')
  })

  it('previews the Markdown as it will read', () => {
    newPage()
    fireEvent.change(screen.getByLabelText('Text'), { target: { value: '## A heading' } })
    fireEvent.click(screen.getByRole('tab', { name: 'Preview' }))
    expect(screen.getByRole('heading', { name: 'A heading' })).toBeTruthy()
  })

  it('previews embedded files as the saved page draws them: the place\'s Files beside the page\'s own section @SC-1558', async () => {
    const asked: SiteFileRef[] = []
    const batch = createEmbedBatch(async refs => {
      asked.push(...refs)
      return refs.map(r => ({
        state: 'ready' as const, facts: { name: 'q3.png', size: 10, version: 'v1', contentType: 'image/png', kind: 'image' as const },
        previewLink: `https://files.example.com/t/${r.space}`, downloadLink: 'https://files.example.com/t/d', expiresAt: Date.now() + 60_000,
      }))
    }, 0)
    render(<EmbedBatchContext.Provider value={batch}><KnowledgeTool owner={owner} /></EmbedBatchContext.Provider>)
    fireEvent.click(screen.getByRole('button', { name: 'New page' }))
    fireEvent.change(screen.getByLabelText('Text'), { target: { value: '![chart](files/e2e-files/charts/q3.png)\n\n<img src="flow.png" width="200">' } })
    fireEvent.click(screen.getByRole('tab', { name: 'Preview' }))
    const images = () => [...document.querySelectorAll('img')]
    await vi.waitFor(() => expect(images()).toHaveLength(2))
    expect(images().map(i => i.getAttribute('src'))).toEqual(['https://files.example.com/t/place', 'https://files.example.com/t/knowledge'])
    expect(images()[1].getAttribute('width')).toBe('200')
    expect(asked).toEqual([
      { space: 'place', loc: { ownerType: 'project', ownerId: 'p1', workspaceId: null, taskId: null }, path: 'e2e-files/charts/q3.png' },
      { space: 'knowledge', owner, path: 'decisions/flow.png' },
    ])
  })

  it('shows what the gate refused on its field', async () => {
    data.saveKnowledge.mockResolvedValue({
      outcome: 'refused', reason: 'problems', message: 'The page was refused. Nothing was changed.',
      problems: [{ code: 'tag_invalid', field: 'tags', message: "tag 'Database' must be lower-case" }],
    })
    newPage()
    type('Title', 'Postgres'); type('Description', 'The database.')
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await vi.waitFor(() => expect(screen.getByText("tag 'Database' must be lower-case")).toBeTruthy())
  })

  it('can be cancelled back to the list', () => {
    newPage()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.getByRole('button', { name: 'New page' })).toBeTruthy()
  })
})

describe('editing a page', () => {
  const edit = async () => {
    setAddress('tool=knowledge&page=decisions/0003.md')
    render(<KnowledgeTool owner={owner} />)
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
  }

  it('opens the page as fields: title, description, tags, properties, text @SC-1430', async () => {
    await edit()
    expect((screen.getByLabelText('Title') as HTMLInputElement).value).toBe('Staging needs an approval')
    expect((screen.getByLabelText('Description') as HTMLInputElement).value).toBe('Who signs off.')
    expect(screen.getByText('decision')).toBeTruthy()
    expect((screen.getByLabelText('Value of status') as HTMLInputElement).value).toBe('proposed')
    expect((screen.getByLabelText('Text') as HTMLTextAreaElement).value).toBe('## Context\nChecks failed twice.\n')
  })

  it('saves from the version it read @SC-1430', async () => {
    data.saveKnowledge.mockResolvedValue({ outcome: 'done', page: 'decisions/0003.md', change: 'edited', version: 'v2' })
    await edit()
    type('Description', 'Who signs off a staging deploy.')
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await vi.waitFor(() => expect(data.saveKnowledge).toHaveBeenCalled())
    expect(data.saveKnowledge.mock.calls[0][0]).toMatchObject({ page: 'decisions/0003.md', baseVersion: 'v1' })
    expect(data.saveKnowledge.mock.calls[0][0].content).toContain('description: Who signs off a staging deploy.')
  })

  it('on a conflict keeps the person’s text, shows theirs on request, and saves over it from the new version @SC-1421', async () => {
    data.saveKnowledge
      .mockResolvedValueOnce({ outcome: 'refused', reason: 'conflict', message: 'Changed. Nothing was changed.', current: { content: 'THEIR PAGE', version: 'v7' } })
      .mockResolvedValueOnce({ outcome: 'done', page: 'decisions/0003.md', change: 'edited', version: 'v8' })
    data.readKnowledgePage.mockResolvedValue({ page: 'decisions/0003.md', content: 'THEIR PAGE', version: 'v7', linkedFrom: [], lastChange: { at: iso(0), by: { kind: 'agent', agentName: 'Kernel', forName: 'Sam' } } })
    await edit()
    type('Description', 'My description.')
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await vi.waitFor(() => expect(screen.getByText('Changed while you were editing')).toBeTruthy())
    expect(screen.getByRole('alert').textContent).toContain('Kernel, asked by Sam')
    expect((screen.getByLabelText('Description') as HTMLInputElement).value).toBe('My description.')
    expect(screen.getByLabelText('Their version').textContent).toBe('THEIR PAGE')
    fireEvent.click(screen.getByRole('button', { name: 'Save mine over it' }))
    await vi.waitFor(() => expect(data.saveKnowledge).toHaveBeenCalledTimes(2))
    expect(data.saveKnowledge.mock.calls[1][0]).toMatchObject({ baseVersion: 'v7' })
    expect(data.saveKnowledge.mock.calls[1][0].content).toContain('My description.')
  })

  it('shows a failed call’s message and keeps the text @SC-1430', async () => {
    data.saveKnowledge.mockRejectedValue(new Error('You may not change this place’s knowledge. Nothing was changed.'))
    await edit()
    type('Description', 'Kept.')
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await vi.waitFor(() => expect(screen.getByRole('alert').textContent).toContain('You may not change'))
    expect((screen.getByLabelText('Description') as HTMLInputElement).value).toBe('Kept.')
  })
})
