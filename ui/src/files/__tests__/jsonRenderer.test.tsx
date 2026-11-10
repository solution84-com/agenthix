import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { FileFrame } from '../FileFrame'
import { wholeRecords } from '../renderers/json/jsonPartial'
import { findJsonProblem } from '../renderers/json/jsonProblem'
import { MB, ready, relayServing } from './testKit'

afterEach(() => vi.unstubAllGlobals())

const bytes = (text: string) => new TextEncoder().encode(text)
const open = (size: number, name = 'package.json') =>
  <FileFrame answer={ready({ name, kind: 'json', contentType: 'application/json', size })} name={name} onReopen={() => {}} />

describe('wholeRecords @SC-1888', () => {
  it('cuts at the last comma between records and closes what was open', () => {
    expect(wholeRecords('[{"a":1},{"a":2},{"a":3},{"a":')).toEqual({ text: '[{"a":1},{"a":2},{"a":3}]', records: 3 })
    expect(wholeRecords('{"rows":[1,2,3,4,"x,')).toEqual({ text: '{"rows":[1,2,3,4]}', records: 4 })
    expect(wholeRecords('["a,b","c')).toEqual({ text: '["a,b"]', records: 1 })
    expect(wholeRecords('{"a": "long')).toBeNull()
  })
})

describe('the JSON renderer, end to end through the frame @SC-1586', () => {
  it('draws a tree folded below the first level, with its fact in the facts line', async () => {
    const body = JSON.stringify({ name: 'agenthix', deps: { a: 1, b: [1, 2, 3] }, ok: true })
    relayServing(bytes(body))
    render(open(body.length))
    expect(await screen.findByText('agenthix', { exact: false })).toBeTruthy()
    expect(screen.getByText('"agenthix"')).toBeTruthy()
    expect(screen.queryByText('b:')).toBeNull()
    expect(screen.getByRole('button', { name: 'deps {2}' }).closest('[role=treeitem]')!.getAttribute('aria-expanded')).toBe('false')
    expect(await screen.findByText(/^JSON · .* · object, 3 keys$/)).toBeTruthy()
  })

  it('opens a fold from the keyboard-reachable button, and closes it again', async () => {
    relayServing(bytes('{"deps":{"a":1,"b":[1,2,3]}}'))
    render(open(29))
    const deps = await screen.findByRole('button', { name: 'deps {2}' })
    expect(screen.queryByText('a:')).toBeNull()
    fireEvent.click(deps)
    expect(screen.getByText('a:')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'b [3]' }).closest('[role=treeitem]')!.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(deps)
    expect(screen.queryByText('a:')).toBeNull()
  })

  it('shows Text as the file wrote it, and goes back to Tree', async () => {
    const body = '{"a":   1}'
    relayServing(bytes(body))
    render(open(body.length))
    await screen.findByRole('tree')
    fireEvent.click(screen.getByRole('tab', { name: 'Text' }))
    expect(document.querySelector('pre')?.textContent).toBe(body)
    expect(screen.queryByRole('tree')).toBeNull()
    fireEvent.click(screen.getByRole('tab', { name: 'Tree' }))
    expect(screen.getByRole('tree')).toBeTruthy()
  })

  it('draws every value as text, never as HTML @SC-1568', async () => {
    const body = JSON.stringify({ '<i>k</i>': '<script>alert(1)</script>' })
    relayServing(bytes(body))
    const { container } = render(open(body.length))
    await screen.findByRole('tree')
    fireEvent.click(screen.getByRole('button', { name: 'root {1}' }))
    fireEvent.click(screen.getByRole('button', { name: 'root {1}' }))
    expect(container.querySelector('script, i')).toBeNull()
    expect(screen.getByText('"<script>alert(1)</script>"')).toBeTruthy()
  })

  it('draws invalid JSON as text, with the line of the problem @SC-1889', async () => {
    const body = '{\n  "a": 1,\n  "b": ,\n  "c": 3\n}\n'
    relayServing(bytes(body))
    const { container } = render(open(body.length))
    expect(await screen.findByText("This isn't valid JSON: the problem is on line 3, column 8.")).toBeTruthy()
    // Through the code view: every line numbered, and the problem line marked.
    expect(container.querySelectorAll('.react-syntax-highlighter-line-number').length).toBe(5)
    const marked = container.querySelectorAll('[data-problem]')
    expect(marked).toHaveLength(1)
    expect(marked[0]!.textContent).toContain('"b": ,')
    expect(screen.queryByRole('tree')).toBeNull()
  })

  it('marks the last drawn line when the problem is at the end of the file @SC-1889', async () => {
    const body = '{\n  "a": 1\n'
    relayServing(bytes(body))
    const { container } = render(open(body.length))
    expect(await screen.findByText("This isn't valid JSON: the file ends before the JSON is complete (after line 2).")).toBeTruthy()
    const marked = container.querySelectorAll('[data-problem]')
    expect(marked).toHaveLength(1)
    expect(marked[0]!.textContent).toContain('"a": 1')
  })

  it('finds the line the same way whatever the engine says', () => {
    expect(findJsonProblem('{"a": 1,}')).toEqual({ line: 1, column: 9 })
    expect(findJsonProblem('[1,\n2,\n3')).toEqual({ line: 3, column: 2 })
    expect(findJsonProblem('')).toEqual({ line: 1, column: 1 })
    expect(findJsonProblem('{"a": tru}')).toEqual({ line: 1, column: 7 })
    expect(findJsonProblem('{"a": "x\ny"}')).toEqual({ line: 1, column: 9 })
    expect(findJsonProblem('{"a": 1} x')).toEqual({ line: 1, column: 10 })
    expect(findJsonProblem('[' .repeat(2000))).toEqual({ line: 1, column: 1002 })
  })

  it('reads all of a file up to 5 MB, and only the first 1 MB of a larger one, as text when it has no records @SC-1571', async () => {
    const body = new Uint8Array(6 * MB).fill(97)
    const fetch = relayServing(body)
    render(open(body.length))
    expect(await screen.findByText('Showing the first 1 MB of 6 MB. Download to see all of it.')).toBeTruthy()
    expect(new Headers(fetch.mock.calls[0]![1]!.headers).get('Range')).toBe(`bytes=0-${MB - 1}`)
    expect(screen.queryByRole('tree')).toBeNull()
    expect(screen.queryByText(/isn't valid JSON/)).toBeNull()
  })

  it('past 5 MB draws the whole records in the first 1 MB as a tree, each folded to one line @SC-1888', async () => {
    const record = JSON.stringify({ id: 1, name: 'x'.repeat(100) })
    const whole = `[${Array.from({ length: Math.ceil((6 * MB) / (record.length + 1)) }, () => record).join(',')}]`
    const body = bytes(whole)
    relayServing(body)
    render(open(body.length))
    const line = await screen.findByText(/^Showing the first [\d,]+ records \(1 MB of 6 MB\)\. Download to see all of it\.$/)
    const n = Number(/first ([\d,]+) records/.exec(line.textContent!)![1]!.replace(/,/g, ''))
    expect(n).toBeGreaterThan(5000)
    expect(n).toBeLessThan(MB / record.length + 1)
    expect(screen.getByRole('tree')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'root [' + n + ']' })).toBeTruthy()
    // Each record is a fold, closed.
    expect(screen.getAllByRole('treeitem').filter(i => i.getAttribute('aria-expanded') === 'false').length).toBeGreaterThan(0)
  }, 30_000)

  it('shows 200 children of a long array at a time', async () => {
    const body = JSON.stringify({ rows: Array.from({ length: 450 }, (_, i) => i) })
    relayServing(bytes(body))
    render(open(body.length))
    fireEvent.click(await screen.findByRole('button', { name: 'rows [450]' }))
    expect(screen.getAllByRole('treeitem').length).toBe(2 + 200)
    fireEvent.click(screen.getByRole('button', { name: 'Show 200 more of 250' }))
    expect(screen.getAllByRole('treeitem').length).toBe(2 + 400)
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
