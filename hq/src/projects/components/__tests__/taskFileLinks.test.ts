/** A path a run's result names, in plain text or inline code, links to the file only when the task's folder has it. */
import { describe, it, expect } from 'vitest'
import { fileSpans, foldersNamed, remarkTaskFiles } from '../taskFileLinks'
import { resolveEmbedTarget } from '../../../shared/components/markdownEmbed/embedTarget'

const files = new Set(['pages/work.md', 'notes.md', 'out/q3 report.pdf'])
const spanned = (text: string) => fileSpans(text, files).map(s => text.slice(s.start, s.end))

describe('the spans of a result that name a file of the task\'s folder @SC-2120', () => {
  it('finds a path in a sentence, without the full stop after it', () => {
    const text = 'I drafted the Work page. The page is in pages/work.md.'
    expect(fileSpans(text, files)).toEqual([{ start: 40, end: 53, path: 'pages/work.md' }])
  })

  it('finds a file at the top of the folder, and one written from it with ./ or /', () => {
    expect(spanned('See notes.md, ./pages/work.md and /notes.md')).toEqual(['notes.md', 'pages/work.md', 'notes.md'])
    expect(fileSpans('in ./pages/work.md', files)[0].path).toBe('pages/work.md')
  })

  it('never guesses: a path the folder does not have, a folder, or part of a longer path is no link', () => {
    expect(spanned('pages/draft.md, pages, pages/ and old/pages/work.md or pages/work.md.bak')).toEqual([])
    expect(spanned('read work.md')).toEqual([])
  })

  it('finds a path in brackets or quotes', () => {
    expect(spanned('(pages/work.md) and "notes.md"')).toEqual(['pages/work.md', 'notes.md'])
  })

  it('finds nothing in a folder with no files', () => {
    expect(fileSpans('pages/work.md', new Set())).toEqual([])
  })
})

describe('the folders a result names @SC-2120', () => {
  it('are the folders of the paths it writes, the top as \'\', each once, at most the number asked', () => {
    expect(foldersNamed('pages/work.md and pages/home.md, notes.md, a/b/c.txt', 4)).toEqual(['pages', '', 'a/b'])
    expect(foldersNamed('a/x.md b/x.md c/x.md', 2)).toEqual(['a', 'b'])
  })

  it('are none for text that writes no path', () => {
    expect(foldersNamed('Done. The page reads well.', 4)).toEqual([])
  })
})

type Node = { type: string; value?: string; url?: string; lang?: string; children?: Node[] }
const text = (value: string): Node => ({ type: 'text', value })
const code = (value: string): Node => ({ type: 'inlineCode', value })
const para = (...children: Node[]): Node => ({ type: 'paragraph', children })
const tree = (...children: Node[]) => {
  const root: Node = { type: 'root', children }
  remarkTaskFiles({ files })(root)
  return root
}
const links = (node: Node): Node[] => [
  ...(node.type === 'link' ? [node] : []),
  ...(node.children ?? []).flatMap(links),
]

describe('the result\'s Markdown @SC-2120', () => {
  it('links a path in plain text, and one in inline code keeping it code', () => {
    const root = tree(para(text('The page is in pages/work.md.')))
    expect(root.children?.[0].children).toEqual([
      text('The page is in '), { type: 'link', url: '/pages/work.md', children: [text('pages/work.md')] }, text('.'),
    ])
    const found = links(tree(para(text('The page is in pages/work.md, see also '), code('notes.md'), text('.'))))
    expect(found.map(l => l.url)).toEqual(['/pages/work.md', '/notes.md'])
    expect(found[0].children).toEqual([{ type: 'text', value: 'pages/work.md' }])
    expect(found[1].children).toEqual([{ type: 'inlineCode', value: 'notes.md' }])
  })

  it('leaves a link, a code block and inline code that is more than a path as they are', () => {
    const found = links(tree(
      para({ type: 'link', url: 'https://example.com/pages/work.md', children: [text('pages/work.md')] }),
      { type: 'code', value: 'pages/work.md' },
      para(code('cat notes.md')),
    ))
    expect(found.map(l => l.url)).toEqual(['https://example.com/pages/work.md'])
  })

  it('writes the link from the top of the task\'s folder, so it opens there', () => {
    const [link] = links(tree(para(text('in out/q3 report.pdf? no: '), code('out/q3 report.pdf'))))
    expect(link.url).toBe('/out/q3%20report.pdf')
    const loc = { ownerType: 'project' as const, ownerId: 'p1', workspaceId: null, taskId: 't1' }
    const target = resolveEmbedTarget('/files/x.md', { place: { space: 'place', loc, siblings: { ownerType: 'project', ownerId: 'p1' } }, folder: '' })
    expect(target).toMatchObject({ kind: 'file', ref: { space: 'place', loc, path: 'files/x.md' } })
    expect(resolveEmbedTarget(link.url, { place: { space: 'place', loc }, folder: '' })).toMatchObject({ kind: 'file', ref: { path: 'out/q3 report.pdf' } })
  })
})
