import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { FileFrame } from '../FileFrame'
import { parseCsv } from '../renderers/table/parseCsv'
import { MB, ready, relayServing } from './testKit'

afterEach(() => vi.unstubAllGlobals())

const bytes = (text: string) => new TextEncoder().encode(text)
const open = (size: number, name = 'sales.csv') =>
  <FileFrame answer={ready({ name, kind: 'csv', contentType: 'text/csv', size })} name={name} onReopen={() => {}} />
const bodyRows = () => screen.getAllByRole('row').slice(1).map(r => within(r).getAllByRole('cell').slice(1).map(c => c.textContent))

describe('parseCsv (RFC 4180) @SC-1587', () => {
  it('reads quotes, escaped quotes, commas and newlines inside fields', () => {
    expect(parseCsv('a,"b,c","d ""q"""\n"x\ny",,z\n').rows).toEqual([['a', 'b,c', 'd "q"'], ['x\ny', '', 'z']])
  })
  it('reads CRLF, a lone CR, a missing final newline and a byte order mark', () => {
    expect(parseCsv('﻿a,b\r\n1,2\r3,4').rows).toEqual([['a', 'b'], ['1', '2'], ['3', '4']])
  })
  it('keeps blank lines in the middle as empty rows but not the one after the last newline', () => {
    expect(parseCsv('a\n\nb\n').rows).toEqual([['a'], [''], ['b']])
    expect(parseCsv('').rows).toEqual([])
  })
  it('reads an unterminated quote to the end, and a quote in the middle of a field as it is', () => {
    expect(parseCsv('a,"b\nc').rows).toEqual([['a', 'b\nc']])
    expect(parseCsv('5" pipe,x').rows).toEqual([['5" pipe', 'x']])
  })
  it('keeps the first rows past the cap and counts them all', () => {
    const parsed = parseCsv('1\n2\n3\n4\n5\n', 3)
    expect(parsed.rows).toEqual([['1'], ['2'], ['3']])
    expect(parsed.total).toBe(5)
  })
})

describe('the table renderer, end to end through the frame @SC-1588', () => {
  const csv = 'name,qty\nbolt,10\nnut,9\nwasher,100\n'

  it('draws a header, row numbers and the cells, with the row count in the facts line', async () => {
    relayServing(bytes(csv))
    render(open(csv.length))
    expect(await screen.findByRole('columnheader', { name: 'name' })).toBeTruthy()
    expect(screen.getAllByRole('row').length).toBe(4)
    expect(within(screen.getAllByRole('row')[1]!).getAllByRole('cell').map(c => c.textContent)).toEqual(['1', 'bolt', '10'])
    expect(await screen.findByText(/^CSV · .* · 3 rows$/)).toBeTruthy()
  })

  it('sorts by a column, numbers as numbers, then reverses, then goes back to the file order', async () => {
    relayServing(bytes(csv))
    render(open(csv.length))
    const qty = await screen.findByRole('columnheader', { name: /qty/ })
    fireEvent.click(within(qty).getByRole('button'))
    expect(bodyRows()).toEqual([['nut', '9'], ['bolt', '10'], ['washer', '100']])
    expect(qty.getAttribute('aria-sort')).toBe('ascending')
    fireEvent.click(within(qty).getByRole('button'))
    expect(bodyRows()).toEqual([['washer', '100'], ['bolt', '10'], ['nut', '9']])
    expect(qty.getAttribute('aria-sort')).toBe('descending')
    fireEvent.click(within(qty).getByRole('button'))
    expect(bodyRows()).toEqual([['bolt', '10'], ['nut', '9'], ['washer', '100']])
    expect(qty.getAttribute('aria-sort')).toBe('none')
  })

  it('draws every cell as text, never as HTML @SC-1568', async () => {
    const body = 'k\n<script>alert(1)</script>\n<b>x</b>\n'
    relayServing(bytes(body))
    const { container } = render(open(body.length))
    await screen.findByRole('columnheader', { name: 'k' })
    expect(container.querySelector('script, b')).toBeNull()
    expect(screen.getByText('<b>x</b>')).toBeTruthy()
  })

  it('shows 10,000 rows of a larger table with a line saying how many there are @SC-1571', async () => {
    const body = 'n\n' + Array.from({ length: 10_050 }, (_, i) => i).join('\n') + '\n'
    relayServing(bytes(body))
    render(open(body.length))
    expect(await screen.findByText('Showing 10,000 of 10,050 rows')).toBeTruthy()
    expect(screen.getAllByRole('row').length).toBe(10_001)
  }, 60_000)

  it('reads at most 5 MB, drops the row the cut fell in, and reports the part shown', async () => {
    const row = 'abcdefghi\n'
    const body = new Uint8Array(6 * MB)
    for (let i = 0; i < body.length; i++) body[i] = row.charCodeAt(i % row.length)
    const fetch = relayServing(body)
    render(open(body.length))
    expect(await screen.findByText('Showing the first 5 MB of 6 MB.')).toBeTruthy()
    expect(new Headers(fetch.mock.calls[0]![1]!.headers).get('Range')).toBe(`bytes=0-${5 * MB - 1}`)
    expect(screen.queryByText(/of .* rows/)).toBeNull()
    expect(screen.getByText('Showing the first 10,000 rows')).toBeTruthy()
  }, 60_000)

  it('scrolls sideways inside its own area', async () => {
    relayServing(bytes(csv))
    render(open(csv.length))
    const table = await screen.findByRole('table')
    expect(table.parentElement!.className).toContain('overflow-auto')
  })

  it('says bytes that are not text in words, and a changed file as changed', async () => {
    relayServing(new Uint8Array([0xff, 0xfe, 0x00, 0xc3]))
    const first = render(open(4))
    expect(await screen.findByText("This doesn't look like text, so it isn't shown.")).toBeTruthy()
    first.unmount()
    relayServing(new Uint8Array(0), 409)
    render(open(4))
    expect(await screen.findByText('This file changed since you opened it.')).toBeTruthy()
  })
})
