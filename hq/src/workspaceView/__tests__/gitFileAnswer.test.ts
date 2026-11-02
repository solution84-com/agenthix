/** A file's text from Git, drawn by HQ's own file viewer (live preview spec, part 1, *Files*). */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { gitFileAnswer } from '../gitFileAnswer'

afterEach(() => vi.restoreAllMocks())

describe('a file read from Git @SC-1686', () => {
  it('is a ready answer whose links are a blob of the page’s own, with the kind its name gives', async () => {
    const made: Blob[] = []
    vi.spyOn(URL, 'createObjectURL').mockImplementation(b => { made.push(b as Blob); return 'blob:here/1' })
    const { answer, link } = gitFileAnswer('src/App.tsx', 'export {}\n', 'v1', 1000)
    expect(link).toBe('blob:here/1')
    expect(answer).toMatchObject({
      state: 'ready', previewLink: 'blob:here/1', downloadLink: 'blob:here/1',
      facts: { name: 'App.tsx', size: 10, version: 'v1', kind: 'code', language: 'tsx' },
    })
    expect(await made[0].text()).toBe('export {}\n')
    expect((answer as { expiresAt: number }).expiresAt - 1000).toBeLessThan(2 ** 31)
  })

  it('is only ever plain text: an SVG is shown as its source, never loaded as an image', async () => {
    const made: Blob[] = []
    vi.spyOn(URL, 'createObjectURL').mockImplementation(b => { made.push(b as Blob); return 'blob:here/3' })
    expect(gitFileAnswer('logo.svg', '<svg onload="x()"/>', 'v1').answer).toMatchObject({ facts: { kind: 'text', contentType: 'text/plain' } })
    expect(gitFileAnswer('page.html', '<script>x()</script>', 'v1').answer).toMatchObject({ facts: { kind: 'code' } })
    expect(made.every(b => b.type.startsWith('text/plain'))).toBe(true)
  })

  it('draws Markdown as Markdown', () => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:here/2')
    expect(gitFileAnswer('README.md', '# Hi', 'v1').answer).toMatchObject({ facts: { kind: 'markdown' } })
  })
})
