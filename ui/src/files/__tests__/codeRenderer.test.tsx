import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { FileFrame } from '../FileFrame'
import { grammarFor } from '../renderers/code/codeLanguages'
import { MB, ready, relayServing } from './testKit'

afterEach(() => vi.unstubAllGlobals())

const source = (text: string) => new TextEncoder().encode(text)
const open = (name: string, language: string, size: number) =>
  <FileFrame answer={ready({ name, kind: 'code', language, contentType: 'text/plain', size })} name={name} onReopen={() => {}} />

describe('the code renderer, end to end through the frame @SC-1585', () => {
  it('highlights as spans of text, with line numbers, and names the language in the facts line @SC-1579', async () => {
    const body = 'const a = "<b>x</b>"\nreturn a\n'
    relayServing(source(body))
    const { container } = render(open('pipeline.ts', 'typescript', body.length))
    await screen.findByText(/return/)
    expect(container.querySelector('.hljs-keyword')?.textContent).toBe('const')
    expect(container.querySelector('.hljs-string')?.textContent).toBe('"<b>x</b>"')
    expect(container.querySelector('b')).toBeNull()
    expect(container.querySelectorAll('.react-syntax-highlighter-line-number').length).toBe(2)
    expect(await screen.findByText(/^TypeScript · .* · 2 lines$/)).toBeTruthy()
  })

  it('puts no colour and no hex value on the page itself', async () => {
    relayServing(source('let x = 1\n'))
    const { container } = render(open('a.ts', 'typescript', 10))
    await screen.findByText(/let/)
    expect(container.innerHTML).not.toMatch(/#[0-9a-f]{3,8}\b|rgb\(/i)
  })

  it('has Wrap off by default and turns it on', async () => {
    relayServing(source('one\ntwo\n'))
    const { container } = render(open('a.py', 'python', 8))
    await screen.findByText(/one/)
    const wrap = screen.getByLabelText('Wrap') as HTMLInputElement
    expect(wrap.checked).toBe(false)
    expect(container.querySelector('code')?.getAttribute('style') ?? '').not.toContain('pre-wrap')
    fireEvent.click(wrap)
    expect(wrap.checked).toBe(true)
    expect(container.querySelector('code')?.getAttribute('style') ?? '').toContain('pre-wrap')
  })

  it('draws a language the highlighter lacks with line numbers and no colour', async () => {
    relayServing(source('model A {}\nmodel B {}\n'))
    const { container } = render(open('schema.prisma', 'prisma', 24))
    await screen.findByText(/model A/)
    expect(container.querySelectorAll('.react-syntax-highlighter-line-number').length).toBe(2)
    expect(container.querySelector('[class*="hljs-"]')).toBeNull()
  })

  it('maps core\'s languages to a grammar, or to none', () => {
    expect(grammarFor('typescript')).toBe('typescript')
    expect(grammarFor('tsx')).toBe('typescript')
    expect(grammarFor('html')).toBe('xml')
    expect(grammarFor('dockerfile')).toBe('dockerfile')
    expect(grammarFor('prisma')).toBe('text')
    expect(grammarFor('graphql')).toBe('text')
    expect(grammarFor(undefined)).toBe('text')
  })

  it('draws a file past 512 KB plain, with a line saying why, and shows all of it up to 1 MB', async () => {
    const body = 'const a = 1\n'.repeat(Math.ceil((600 * 1024) / 12))
    relayServing(source(body))
    const { container } = render(open('big.ts', 'typescript', body.length))
    expect(await screen.findByText('Highlighting is off for files over 512 KB.')).toBeTruthy()
    expect(container.querySelector('[class*="hljs-"]')).toBeNull()
    expect(container.querySelector('pre')?.textContent?.length).toBe(body.length)
  })

  it('reads at most 1 MB and says so for a larger file', async () => {
    const body = new Uint8Array(Math.round(2.5 * MB)).fill(97)
    const fetch = relayServing(body)
    render(open('huge.ts', 'typescript', body.length))
    expect(await screen.findByText('Showing the first 1 MB of 2.5 MB.')).toBeTruthy()
    expect(new Headers(fetch.mock.calls[0]![1]!.headers).get('Range')).toBe(`bytes=0-${MB - 1}`)
  })

  it('says bytes that are not text in words, and a changed file as changed', async () => {
    relayServing(new Uint8Array([0xff, 0xfe, 0x00, 0xc3]))
    render(open('a.ts', 'typescript', 4))
    expect(await screen.findByText("This doesn't look like text, so it isn't shown.")).toBeTruthy()
  })

  it('turns a 409 into the changed state', async () => {
    relayServing(new Uint8Array(0), 409)
    render(open('a.ts', 'typescript', 4))
    expect(await screen.findByText('This file changed since you opened it.')).toBeTruthy()
  })
})
