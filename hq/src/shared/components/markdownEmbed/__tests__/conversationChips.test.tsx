// @vitest-environment jsdom
/** Words read in a conversation's place: chips for its files, images drawn, and what changed since (spec part 3, D19). */
import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import type { FileOpenAnswer, SiteFileRef } from '@agenthix/core'
import { MarkdownMessage, type MarkdownEmbedContext } from '../../MarkdownMessage'
import { createEmbedBatch } from '../embedBatch'
import { EmbedBatchContext } from '../useEmbedAnswer'
import { ChipFactsContext } from '../useChipFacts'
import type { FileFactsAnswer } from '../../../../files/fileFactsAnswer'
import { CHANGED_SINCE_WORDS } from '../FileChip'

const uiLucideReactPath = vi.hoisted(() => {
  const uiEntry = require.resolve('@agenthix/ui/files')
  return require('node:module').createRequire(uiEntry).resolve('lucide-react')
})
vi.mock(uiLucideReactPath, async (importOriginal) => {
  const icon = () => null
  return { ...(await importOriginal<object>()), File: icon, FileImage: icon, FileText: icon, Loader2: icon, MoreHorizontal: icon }
})

const owner = { ownerType: 'project', ownerId: 'p1' } as const
const loc = { ...owner, workspaceId: null, taskId: null }
const WRITTEN = '2026-10-20T10:00:00.000Z'
const BEFORE = Date.parse(WRITTEN) - 60_000
const AFTER = Date.parse(WRITTEN) + 60_000

const keyOf = (r: SiteFileRef) => (r.space === 'place' ? `${r.loc.workspaceId ? `ws:${r.loc.workspaceId}/` : ''}${r.path}` : r.space === 'artefact' ? `artefact:${r.name}` : r.path)

function answerFor(ref: SiteFileRef): FileOpenAnswer {
  const key = keyOf(ref)
  if (key.includes('gone')) return { state: 'not-found' }
  const name = key.split('/').pop()!
  const image = name.endsWith('.png')
  return {
    state: 'ready',
    facts: { name, size: 10, version: `10:${key.includes('changed') ? AFTER : BEFORE}`, contentType: image ? 'image/png' : 'application/pdf', kind: image ? 'image' : 'pdf' },
    previewLink: `https://files.example.com/t/preview.${encodeURIComponent(key)}`,
    downloadLink: `https://files.example.com/t/download.${encodeURIComponent(key)}`,
    expiresAt: Date.now() + 300_000,
  }
}

function factsFor(ref: SiteFileRef): FileFactsAnswer {
  const answer = answerFor(ref)
  if (keyOf(ref).includes('linked')) return { state: 'linked' }
  return answer.state === 'ready' ? { state: 'ready', facts: answer.facts } : { state: 'gone' }
}

function setup(content: string, over: Partial<MarkdownEmbedContext> = {}) {
  const asked: string[] = []
  const factsAsked: string[] = []
  const batch = createEmbedBatch(async files => { asked.push(...files.map(keyOf)); return files.map(answerFor) }, 0)
  const facts = createEmbedBatch(async files => { factsAsked.push(...files.map(keyOf)); return files.map(factsFor) }, 0)
  const onOpen = vi.fn()
  const embed: MarkdownEmbedContext = {
    place: { space: 'owner', owner }, folder: '', onOpen, placePath: '/projects/AGX', writtenAt: WRITTEN, ...over,
  }
  const view = render(
    <EmbedBatchContext.Provider value={batch}>
      <ChipFactsContext.Provider value={facts}>
        <MarkdownMessage content={content} embed={embed} />
      </ChipFactsContext.Provider>
    </EmbedBatchContext.Provider>,
  )
  return { ...view, asked, factsAsked, onOpen }
}

afterEach(cleanup)

describe('paths an agent writes in its reply @SC-1539', () => {
  it('become chips with icon, name and kind, opening the file in the conversation\'s place', async () => {
    const { onOpen } = setup('I put the report in files/reports/q3.pdf and the draft in `artefacts/draft.md`.')
    fireEvent.click(screen.getByRole('button', { name: 'reports/q3.pdf PDF' }))
    expect(onOpen).toHaveBeenCalledWith({ space: 'place', loc, path: 'reports/q3.pdf' })
    fireEvent.click(screen.getByRole('button', { name: 'draft.md Markdown' }))
    expect(onOpen).toHaveBeenCalledWith({ space: 'artefact', owner, name: 'draft.md' })
  })

  it('make a link to an artefact or a workspace file a chip too, as old messages wrote them', () => {
    const { onOpen } = setup('See [Pricing options](artefacts/pricing.md) and [the app](workspaces/w1/src/app.ts) today.')
    fireEvent.click(screen.getByRole('button', { name: /Pricing options/ }))
    expect(onOpen).toHaveBeenCalledWith({ space: 'artefact', owner, name: 'pricing.md' })
    fireEvent.click(screen.getByRole('button', { name: /the app/ }))
    expect(onOpen).toHaveBeenCalledWith({ space: 'place', loc: { ...loc, workspaceId: 'w1' }, path: 'src/app.ts' })
  })

  it('ask after their files\' facts only, opening none, so no ticket is signed for a chip', async () => {
    const { asked, factsAsked } = setup('See files/reports/q3.pdf and `artefacts/draft.md`.')
    await waitFor(() => expect(factsAsked.sort()).toEqual(['artefact:draft.md', 'reports/q3.pdf']))
    expect(asked).toEqual([])
  })

  it('strike through a file that is gone, keeping its name', async () => {
    const { container } = setup('It was in files/old/gone.pdf yesterday.')
    await waitFor(() => expect(container.querySelector('[data-gone]')).not.toBeNull())
    expect(container.querySelector('[data-gone]')!.textContent).toContain('old/gone.pdf')
    expect(container.querySelector('[data-gone] button')!.className).toContain('line-through')
  })

  it('say a file that is gone in words, drawn quietly, and still open to say where it was looked for (S20) @SC-1880', async () => {
    const { container, onOpen } = setup('It was in files/old/gone.pdf yesterday.')
    await waitFor(() => expect(container.querySelector('[data-gone]')).not.toBeNull())
    const chip = container.querySelector('[data-gone] button') as HTMLButtonElement
    expect(chip.textContent).toContain('Not here any more')
    expect(chip.className).toContain('text-text-muted')
    expect(chip.className).not.toContain('text-accent ')
    chip.click()
    expect(onOpen).toHaveBeenCalled()
  })

  it('draw a hard-linked file as there, not struck through: it opens to say why it is not shown (D4) @SC-1880', async () => {
    const { container } = setup('See files/data/linked.csv please.')
    await waitFor(() => expect(container.querySelector('[data-embed="chip"]')).not.toBeNull())
    await new Promise(r => setTimeout(r, 5))
    expect(container.querySelector('[data-gone]')).toBeNull()
  })

  it('say the kind once when the link is written as the kind (M9) @SC-1880', async () => {
    const { container } = setup('The [PDF](files/reports/q3.pdf) is ready.')
    await waitFor(() => expect(container.querySelector('[data-embed="chip"]')).not.toBeNull())
    expect(container.querySelector('[data-embed="chip"]')!.textContent).toBe('PDF')
  })

  it('leave text that names no folder of the place as text', () => {
    const { container } = setup('Not a file: members/u1/agenda.md, or src/app.ts.')
    expect(container.querySelector('[data-embed]')).toBeNull()
  })

  it('stay plain text where the words are not read in a conversation\'s place', () => {
    const { container } = setup('See files/reports/q3.pdf.', { place: { space: 'place', loc }, folder: '' })
    expect(container.querySelector('[data-embed="chip"]')).toBeNull()
    expect(container.textContent).toContain('files/reports/q3.pdf')
  })
})

describe('images in an agent\'s reply @SC-1553', () => {
  it('draw a path in the place through the relay', async () => {
    const { container, asked } = setup('![flow](files/diagrams/flow.png)')
    await waitFor(() => expect(container.querySelector('img')).not.toBeNull())
    expect(container.querySelector('img')!.getAttribute('src')).toBe(`https://files.example.com/t/preview.${encodeURIComponent('diagrams/flow.png')}`)
    expect(asked).toEqual(['diagrams/flow.png'])
  })

  it('hold an image on another website behind Load (T13) @SC-1574', () => {
    const { container } = setup('![chart](https://tracker.example/pixel.png)')
    expect(container.querySelector('img')).toBeNull()
    expect(screen.getByRole('button', { name: 'Image from tracker.example · Load' })).toBeTruthy()
  })

  it('say "Changed since this message" when the file changed after the message was written', async () => {
    setup('![flow](files/diagrams/changed.png) and files/reports/q3.pdf')
    await waitFor(() => expect(screen.getAllByText(CHANGED_SINCE_WORDS)).toHaveLength(1))
  })

  it('say nothing of a change for a message with no time (a reply still being written)', async () => {
    const { container } = setup('![flow](files/diagrams/changed.png)', { writtenAt: undefined })
    await waitFor(() => expect(container.querySelector('img')).not.toBeNull())
    expect(screen.queryByText(CHANGED_SINCE_WORDS)).toBeNull()
  })
})

describe('a stable link pasted into a message @SC-1540', () => {
  it('shows as the same chip, opening beside the thread when it names this place', () => {
    const href = `${window.location.origin}/projects/AGX?tool=files&file=reports%2Fq3.pdf`
    const { onOpen } = setup(`Look at ${href} please`)
    fireEvent.click(screen.getByRole('button', { name: 'q3.pdf PDF' }))
    expect(onOpen).toHaveBeenCalledWith({ space: 'place', loc, path: 'reports/q3.pdf' })
  })

  it('goes to another place\'s address as a chip, asking that place for nothing', () => {
    const href = `${window.location.origin}/projects/OTHER?tool=files&file=plan.md`
    const { asked, factsAsked } = setup(`Look at ${href} please`)
    const chip = screen.getByRole('link', { name: 'plan.md Markdown' })
    expect(chip.getAttribute('href')).toBe(href)
    expect(chip.getAttribute('target')).toBeNull()
    expect(asked).toEqual([])
    expect(factsAsked).toEqual([])
  })
})
