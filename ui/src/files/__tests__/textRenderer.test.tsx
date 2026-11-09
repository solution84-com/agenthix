import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { FileFrame } from '../FileFrame'
import { MB, ready, relayServing } from './testKit'
import { splitLines } from '../renderers/text/TextLines'

afterEach(() => vi.unstubAllGlobals())

describe('the text renderer, end to end through the frame @SC-1583', () => {
  it('draws plain text, wrapped, never as HTML, with its line count @SC-1568', async () => {
    relayServing(new TextEncoder().encode('<b>bold?</b>\nsecond line\n'))
    render(<FileFrame answer={ready({ size: 25 })} name="notes.txt" onReopen={() => {}} />)
    const text = (await screen.findByText(/<b>bold\?<\/b>/)).closest('pre')!
    expect(text.tagName).toBe('PRE')
    expect(text.className).toContain('whitespace-pre-wrap')
    expect(text.className).toContain('break-words')
    expect(text.querySelector('b')).toBeNull()
    expect(await screen.findByText('Text · 25 B · 2 lines')).toBeTruthy()
  })

  it('counts one line for a file with no newline', async () => {
    relayServing(new TextEncoder().encode('one'))
    render(<FileFrame answer={ready({ size: 3 })} name="a.txt" onReopen={() => {}} />)
    expect(await screen.findByText('Text · 3 B · 1 line')).toBeTruthy()
  })

  it('says an empty file is empty in the preview\'s place, reading nothing @SC-1590', () => {
    const fetch = relayServing(new Uint8Array(0))
    render(<FileFrame answer={ready({ size: 0 })} name="b.txt" onReopen={() => {}} />)
    expect(screen.getByText('This file is empty.')).toBeTruthy()
    expect(screen.queryByTestId('file-frame-view')).toBeNull()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('never draws one multi-megabyte run: a long line is cut into pieces, and every character is still there @SC-1591', async () => {
    const line = 'x'.repeat(300_000)
    relayServing(new TextEncoder().encode(line))
    const { container } = render(<FileFrame answer={ready({ size: line.length })} name="one-line.txt" onReopen={() => {}} />)
    await screen.findByText(/^Text · /)
    const pieces = [...container.querySelectorAll('pre > span')]
    expect(pieces.length).toBeGreaterThan(100)
    expect(Math.max(...pieces.map(p => p.textContent!.length))).toBeLessThanOrEqual(1000)
    expect(pieces.map(p => p.textContent).join('')).toBe(line)
  })

  it('reads at most 1 MB and shows the first 1 MB of a larger file, under the line @SC-1571', async () => {
    const body = new Uint8Array(Math.round(3.4 * MB)).fill(97)
    const fetch = relayServing(body)
    render(<FileFrame answer={ready({ size: body.length })} name="run.log" onReopen={() => {}} />)
    expect(await screen.findByText('Showing the first 1 MB of 3.4 MB. Download to see all of it.')).toBeTruthy()
    expect(new Headers(fetch.mock.calls[0]![1]!.headers).get('Range')).toBe(`bytes=0-${MB - 1}`)
  })

  it('does not call a multi-byte character cut at the cap bytes that are not text', async () => {
    const body = new Uint8Array(2 * MB).fill(97)
    body.set([0xc3, 0xa9], MB - 1)
    relayServing(body)
    render(<FileFrame answer={ready({ size: body.length })} name="run.log" onReopen={() => {}} />)
    expect(await screen.findByText(/Showing the first 1 MB/)).toBeTruthy()
  })

  it('says bytes that are not text in words', async () => {
    relayServing(new Uint8Array([0xff, 0xfe, 0x00, 0xc3]))
    render(<FileFrame answer={ready({ size: 4 })} name="notes.txt" onReopen={() => {}} />)
    expect(await screen.findByText("This doesn't look like text, so it isn't shown.")).toBeTruthy()
  })

  it('turns a 409 into the changed state', async () => {
    relayServing(new Uint8Array(0), 409)
    render(<FileFrame answer={ready()} name="notes.txt" onReopen={() => {}} />)
    expect(await screen.findByText('This file changed since you opened it.')).toBeTruthy()
  })

  it('turns an unavailable relay into the relay state', async () => {
    relayServing(new Uint8Array(0), 503)
    render(<FileFrame answer={ready()} name="notes.txt" onReopen={() => {}} />)
    expect(await screen.findByText(/can't be read right now/)).toBeTruthy()
  })
})

describe('splitLines @SC-1591', () => {
  it('keeps lines, drops the newline at the end, and cuts a long one after a comma where it can', () => {
    expect(splitLines('a\nb\n')).toEqual(['a', 'b'])
    expect(splitLines('a\n\nb')).toEqual(['a', '', 'b'])
    expect(splitLines('')).toEqual([])
    const long = `${'k'.repeat(800)},${'v'.repeat(800)}`
    expect(splitLines(long, 1000)).toEqual([`${'k'.repeat(800)},`, 'v'.repeat(800)])
    expect(splitLines('z'.repeat(2500), 1000).map(p => p.length)).toEqual([1000, 1000, 500])
  })
})
