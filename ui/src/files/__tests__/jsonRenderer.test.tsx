import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { FileFrame } from '../FileFrame'
import { findJsonProblem } from '../renderers/json/jsonProblem'
import { MB, ready, relayServing } from './testKit'

afterEach(() => vi.unstubAllGlobals())

const bytes = (text: string) => new TextEncoder().encode(text)
const open = (size: number, name = 'package.json') =>
  <FileFrame answer={ready({ name, kind: 'json', contentType: 'application/json', size })} name={name} onReopen={() => {}} />

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

  it('draws invalid JSON as text, with the line of the problem', async () => {
    const body = '{\n  "a": 1,\n  "b": ,\n  "c": 3\n}\n'
    relayServing(bytes(body))
    const { container } = render(open(body.length))
    expect(await screen.findByText("This isn't valid JSON: the problem is on line 3, column 8.")).toBeTruthy()
    expect(container.querySelector('pre')?.textContent).toBe(body)
    expect(screen.queryByRole('tree')).toBeNull()
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

  it('reads at most 5 MB, and draws a larger file as its first 5 MB of text under the line @SC-1571', async () => {
    const body = new Uint8Array(6 * MB).fill(97)
    const fetch = relayServing(body)
    render(open(body.length))
    expect(await screen.findByText('Showing the first 5 MB of 6 MB.')).toBeTruthy()
    expect(new Headers(fetch.mock.calls[0]![1]!.headers).get('Range')).toBe(`bytes=0-${5 * MB - 1}`)
    expect(screen.queryByRole('tree')).toBeNull()
    expect(screen.queryByText(/isn't valid JSON/)).toBeNull()
  })

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
