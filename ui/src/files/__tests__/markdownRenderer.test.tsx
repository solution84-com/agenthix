import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { FileFrame } from '../FileFrame'
import { withMarkdown, defaultRegistry } from '../registry'
import { MB, facts, ready, relayServing } from './testKit'

afterEach(() => vi.unstubAllGlobals())

const SOURCE = '# Q3 summary\n\nRevenue grew **6%**.\n'
const renderMarkdown = vi.fn((md: string) => <article data-testid="read">{md.split('\n')[0]!.replace('# ', 'H:')}</article>)
const registry = withMarkdown(renderMarkdown)
const answer = (size = SOURCE.length) => ready({ name: 'summary.md', kind: 'markdown', contentType: 'text/markdown', size })

describe('the Markdown renderer @SC-1584', () => {
  it('draws Read through the caller\'s renderMarkdown, with the line count', async () => {
    relayServing(new TextEncoder().encode(SOURCE))
    render(<FileFrame answer={answer()} name="summary.md" registry={registry} onReopen={() => {}} />)
    expect((await screen.findByTestId('read')).textContent).toBe('H:Q3 summary')
    expect(renderMarkdown).toHaveBeenCalledWith(SOURCE)
    expect(screen.getByRole('tab', { name: 'Read' }).getAttribute('aria-selected')).toBe('true')
    expect(await screen.findByText(/3 lines/)).toBeTruthy()
  })

  it('switches to Source, which is the text as written, never as Markdown or HTML, and back @SC-1568', async () => {
    relayServing(new TextEncoder().encode('# T\n<b>x</b>\n'))
    render(<FileFrame answer={answer(13)} name="summary.md" registry={registry} onReopen={() => {}} />)
    await screen.findByTestId('read')
    fireEvent.click(screen.getByRole('tab', { name: 'Source' }))
    const pre = await screen.findByText(/<b>x<\/b>/)
    expect(pre.tagName).toBe('PRE')
    expect(pre.querySelector('b')).toBeNull()
    expect(screen.queryByTestId('read')).toBeNull()
    fireEvent.click(screen.getByRole('tab', { name: 'Read' }))
    expect(await screen.findByTestId('read')).toBeTruthy()
  })

  it('embedded: is a card, since only images draw inside a page', () => {
    const fetch = relayServing(new TextEncoder().encode(SOURCE))
    render(<FileFrame answer={answer()} name="summary.md" registry={registry} mode="embedded" onOpen={() => {}} onReopen={() => {}} />)
    expect(screen.getByText('summary.md')).toBeTruthy()
    expect(screen.queryByTestId('read')).toBeNull()
    expect(screen.queryByRole('tab')).toBeNull()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('reads at most 1 MB and reports partial past it', async () => {
    const body = new Uint8Array(Math.round(3.4 * MB)).fill(97)
    const fetch = relayServing(body)
    render(<FileFrame answer={answer(body.length)} name="summary.md" registry={registry} onReopen={() => {}} />)
    expect(await screen.findByText('Showing the first 1 MB of 3.4 MB.')).toBeTruthy()
    expect(new Headers(fetch.mock.calls[0]![1]!.headers).get('Range')).toBe(`bytes=0-${MB - 1}`)
  })

  it('says bytes that are not text in words', async () => {
    relayServing(new Uint8Array([0xff, 0xfe, 0x00, 0xc3]))
    render(<FileFrame answer={answer(4)} name="summary.md" registry={registry} onReopen={() => {}} />)
    expect(await screen.findByText("This doesn't look like text, so it isn't shown.")).toBeTruthy()
  })

  it('turns a 409 into the changed state', async () => {
    relayServing(new Uint8Array(0), 409)
    render(<FileFrame answer={answer()} name="summary.md" registry={registry} onReopen={() => {}} />)
    expect(await screen.findByText('This file changed since you opened it.')).toBeTruthy()
  })

  it('without a renderMarkdown the default list draws the text as text', async () => {
    expect(defaultRegistry.find('markdown')?.id).toBe('markdown')
    expect(defaultRegistry.find('markdown')?.embeds).toBe(false)
    relayServing(new TextEncoder().encode('# T\n'))
    render(<FileFrame answer={answer(4)} name="summary.md" onReopen={() => {}} />)
    expect((await screen.findByText('# T')).tagName).toBe('PRE')
    expect(facts({ kind: 'markdown' }).kind).toBe('markdown')
  })
})
