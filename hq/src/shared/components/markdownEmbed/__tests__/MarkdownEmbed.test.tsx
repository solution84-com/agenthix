// @vitest-environment jsdom
import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import type { FileOpenAnswer, SiteFileRef } from '@agenthix/core'
import { MarkdownMessage, type MarkdownEmbedContext } from '../../MarkdownMessage'
import { createEmbedBatch } from '../embedBatch'
import { EmbedBatchContext } from '../useEmbedAnswer'
import { ChipFactsContext } from '../useChipFacts'
import type { FileFactsAnswer } from '../../../../files/fileFactsAnswer'

// Where ui has its own copy of lucide-react, the icons ui's card draws are stubbed by that path, so no second React
// renders (as filesTools.test.tsx does).
const uiLucideReactPath = vi.hoisted(() => {
  const uiEntry = require.resolve('@agenthix/ui/files')
  return require('node:module').createRequire(uiEntry).resolve('lucide-react')
})
vi.mock(uiLucideReactPath, async (importOriginal) => {
  const icon = () => null
  return { ...(await importOriginal<object>()), File: icon, FileImage: icon, FileText: icon, Loader2: icon, MoreHorizontal: icon }
})

const loc = { ownerType: 'project', ownerId: 'p1', workspaceId: null, taskId: null } as const
const pathOf = (r: SiteFileRef) => (r.space === 'place' ? r.path : '')

function ready(path: string): FileOpenAnswer {
  const name = path.split('/').pop()!
  const image = /\.(png|svg)$/.test(name)
  return {
    state: 'ready',
    facts: { name, size: 86_016, version: 'v1', contentType: image ? 'image/png' : 'text/csv', kind: image ? 'image' : 'csv' },
    previewLink: `https://files.example.com/t/preview.${encodeURIComponent(path)}`,
    downloadLink: `https://files.example.com/t/download.${encodeURIComponent(path)}`,
    expiresAt: Date.now() + 300_000,
  }
}

function setup(content: string, over: Partial<MarkdownEmbedContext> = {}) {
  const calls: string[][] = []
  const batch = createEmbedBatch(async files => {
    calls.push(files.map(pathOf))
    return files.map(f => (pathOf(f).includes('gone') ? { state: 'not-found' } : ready(pathOf(f))))
  }, 0)
  const factsCalls: string[][] = []
  const facts = createEmbedBatch<FileFactsAnswer>(async files => {
    factsCalls.push(files.map(pathOf))
    return files.map(f => {
      const a = ready(pathOf(f))
      return a.state === 'ready' && !pathOf(f).includes('gone') ? { state: 'ready', facts: a.facts } : { state: 'gone' }
    })
  }, 0)
  const embed: MarkdownEmbedContext = { place: { space: 'place', loc }, folder: 'reports', ...over }
  const view = render(
    <EmbedBatchContext.Provider value={batch}>
      <ChipFactsContext.Provider value={facts}>
        <MarkdownMessage content={content} embed={embed} />
      </ChipFactsContext.Provider>
    </EmbedBatchContext.Provider>,
  )
  return { ...view, calls, factsCalls }
}

afterEach(cleanup)

describe('Markdown with no place @SC-1550', () => {
  it('an image tag stays text and another website\'s image waits for Load', () => {
    const { container } = render(<MarkdownMessage content={'<img src="a.png" width="60">\n\n![x](https://example.org/a.png)'} />)
    expect(container.textContent).toContain('<img src="a.png" width="60">')
    expect(container.querySelector('img')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Load/ }))
    expect(container.querySelector('img')!.getAttribute('src')).toBe('https://example.org/a.png')
  })
})

describe('images in the place @SC-1551', () => {
  it('embeds a relative image through the relay, resolved against the page\'s folder', async () => {
    const { container, calls } = setup('![Q3](charts/q3.png)')
    await waitFor(() => expect(container.querySelector('img')).not.toBeNull())
    const img = container.querySelector('img')!
    expect(img.getAttribute('src')).toBe(`https://files.example.com/t/preview.${encodeURIComponent('reports/charts/q3.png')}`)
    expect(img.getAttribute('alt')).toBe('Q3')
    expect(img.getAttribute('referrerpolicy')).toBe('no-referrer')
    expect(calls).toEqual([['reports/charts/q3.png']])
  })

  it('shows a path out of the place as a broken image with its name, asking for nothing', async () => {
    const { calls } = setup('![](../../../etc/q3.png)')
    expect(screen.getByRole('img', { name: "q3.png can't be shown: ../../../etc/q3.png is outside this place, so it isn't shown" })).toBeTruthy()
    await new Promise(r => setTimeout(r, 5))
    expect(calls).toEqual([])
  })

  it('shows a file that is not there, or not the person\'s, as a broken image', async () => {
    setup('![](gone.png)')
    // The path it looked for and why are said, not only the name (S18).
    const broken = await screen.findByRole('img', { name: "gone.png can't be shown: reports/gone.png isn't there" })
    expect(broken.textContent).toContain("reports/gone.png isn't there")
  })

  it('asks for every embed on screen in one request, each file once', async () => {
    const { container, calls } = setup('![](a.png) ![](b.png)\n\n<img src="a.png" width="10">\n\n[data](q3.csv)')
    await waitFor(() => expect(container.querySelectorAll('img')).toHaveLength(3))
    expect(calls).toHaveLength(1)
    expect(calls[0].sort()).toEqual(['reports/a.png', 'reports/b.png', 'reports/q3.csv'])
  })
})

describe('the sized image tag (D23) @SC-1552 @SC-1568', () => {
  it('draws an image tag like a Markdown image, keeping only src, alt, width and height', async () => {
    const { container } = setup('<img src="charts/q3.png" alt="Q3" width="600" height="300" onerror="alert(1)" style="position:fixed" srcset="https://example.org/t.png 2x" class="x">')
    await waitFor(() => expect(container.querySelector('img')).not.toBeNull())
    const img = container.querySelector('img')!
    expect(img.getAttribute('width')).toBe('600')
    expect(img.getAttribute('height')).toBe('300')
    expect(img.getAttribute('alt')).toBe('Q3')
    for (const attr of ['onerror', 'style', 'srcset']) expect(img.getAttribute(attr)).toBeNull()
    expect(img.getAttribute('class')).not.toBe('x')
    expect(img.getAttribute('src')).toContain('https://files.example.com/t/preview.')
  })

  it('draws an image tag inside a sentence too', async () => {
    const { container } = setup('See <img src="a.png" width="20"> here.')
    await waitFor(() => expect(container.querySelector('img')).not.toBeNull())
    expect(container.textContent).toContain('See')
    expect(container.textContent).toContain('here.')
  })

  it.each([
    '<script>alert(1)</script>',
    '<iframe src="https://example.org"></iframe>',
    '<a href="javascript:alert(1)">click</a>',
    '<div onclick="alert(1)">x</div>',
    '<b onclick="alert(1)">bold</b>',
  ])('leaves %s as text', html => {
    const { container } = setup(html)
    expect(container.querySelector('script, iframe, [onclick], a[href^="javascript"]')).toBeNull()
    expect(container.textContent).toContain(html.slice(0, 12))
  })

  it('treats an image tag whose src is javascript: as nothing a file can be', () => {
    const { container } = setup('<img src="javascript:alert(1)" alt="x">')
    expect(container.querySelector('img')).toBeNull()
    expect(screen.getByRole('img', { name: "x can't be shown" })).toBeTruthy()
  })
})

describe('images on another website (T13) @SC-1553 @SC-1574', () => {
  it('waits for Load before asking that website for anything', async () => {
    const { container, calls } = setup('![](https://example.org/track.png)')
    expect(container.querySelector('img')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Image from example.org · Load' }))
    const img = container.querySelector('img')!
    expect(img.getAttribute('src')).toBe('https://example.org/track.png')
    expect(img.getAttribute('referrerpolicy')).toBe('no-referrer')
    expect(calls).toEqual([])
  })

  it('holds an image tag pointing at another website behind Load too', () => {
    const { container } = setup('<img src="https://example.org/t.png" width="10">')
    expect(container.querySelector('img')).toBeNull()
    expect(screen.getByRole('button', { name: 'Image from example.org · Load' })).toBeTruthy()
  })
})

describe('links to files @SC-1554', () => {
  it('draws a link alone on its line as a card with the file\'s facts, which opens it', async () => {
    const onOpen = vi.fn()
    setup('[the numbers](data/q3.csv)', { onOpen })
    await waitFor(() => expect(screen.getByRole('button', { name: /q3\.csv/ }).textContent).toMatch(/84 KB/))
    fireEvent.click(screen.getByRole('button', { name: /q3\.csv/ }))
    expect(onOpen).toHaveBeenCalledWith({ space: 'place', loc, path: 'reports/data/q3.csv' })
    expect(screen.getByRole('link', { name: /download/i }).getAttribute('href')).toContain('download.')
  })

  it('draws a link inside a sentence as a chip with its kind, which opens it', async () => {
    const onOpen = vi.fn()
    const { calls, factsCalls } = setup('The numbers are in [q3.csv](data/q3.csv) today.', { onOpen })
    fireEvent.click(screen.getByRole('button', { name: 'q3.csv CSV' }))
    expect(onOpen).toHaveBeenCalledWith({ space: 'place', loc, path: 'reports/data/q3.csv' })
    await waitFor(() => expect(factsCalls).toEqual([['reports/data/q3.csv']]))
    // A chip asks after its facts and opens nothing: no ticket is signed for it, and nothing recorded.
    expect(calls).toEqual([])
  })

  it('draws an image that turns out not to be one as a chip with the facts already opened, asking nothing more', async () => {
    const { calls, factsCalls } = setup('![numbers](data/q3.csv)')
    expect(await screen.findByText('CSV')).toBeTruthy()
    expect(calls).toEqual([['reports/data/q3.csv']])
    expect(factsCalls).toEqual([])
  })

  it('leaves a link to a website, or an anchor, as a link', () => {
    const { container } = setup('[site](https://example.org) and [here](#top)')
    const links = [...container.querySelectorAll('a')].map(a => a.getAttribute('href'))
    expect(links).toEqual(['https://example.org', '#top'])
  })
})

describe('Markdown with no place holds outside images', () => {
  it("holds another website's image behind Load", () => {
    const { container } = render(<MarkdownMessage content="![x](https://other.example/?d=secret)" />)
    expect(container.querySelector('img')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Load/ }))
    expect(container.querySelector('img')?.getAttribute('src')).toBe('https://other.example/?d=secret')
  })
  it('does not draw an image that is not a web address', () => {
    const { container } = render(<MarkdownMessage content="![x](data:image/png;base64,AAAA)" />)
    expect(container.querySelector('img')).toBeNull()
  })
})
