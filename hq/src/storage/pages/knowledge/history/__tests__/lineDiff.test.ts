import { describe, expect, it } from 'vitest'
import { diffLines, diffPages, withContext } from '../lineDiff'
import { authorLabel } from '../authorLabel'

describe('diffLines @SC-1425', () => {
  it('marks the lines that went and the lines that came, keeping the rest', () => {
    const d = diffLines('a\nb\nc', 'a\nB\nc')
    expect(d.map(l => `${l.kind}:${l.text}`)).toEqual(['same:a', 'del:b', 'add:B', 'same:c'])
  })

  it('shows a page with nothing before it as all new, and nothing after as all gone', () => {
    expect(diffLines('', 'x\ny').every(l => l.kind === 'add')).toBe(true)
    expect(diffLines('x', '').every(l => l.kind === 'del')).toBe(true)
  })

  it('does not build the table for a very large pair, and shows the whole text replaced', () => {
    const big = Array.from({ length: 800 }, (_, i) => `line ${i}`).join('\n')
    const d = diffLines(big, `${big}\nmore`)
    expect(d.some(l => l.kind === 'same')).toBe(false)
  })

  it('keeps a little context around a change and folds the long unchanged run between', () => {
    const lines = Array.from({ length: 20 }, (_, i) => `l${i}`)
    const after = [...lines]
    after[0] = 'first'
    after[19] = 'last'
    const shown = withContext(diffLines(lines.join('\n'), after.join('\n')))
    expect(shown.filter(l => l === null)).toHaveLength(1)
    expect(shown.length).toBeLessThan(20)
  })
})

describe('diffPages @SC-1425', () => {
  const page = (title: string, tags: string, body: string, extra = '') => `---\ntitle: ${title}\ndescription: d\ntags: [${tags}]\n${extra}---\n${body}`

  it('reports a changed tag list and a changed line apart', () => {
    const d = diffPages(page('Release', 'releases', 'Cut on Thursdays.'), page('Release', 'releases, deploys', 'Cut on Fridays.'))
    expect(d.fields).toEqual([{ name: 'tags', before: 'releases', after: 'releases, deploys' }])
    expect(d.lines.filter(l => l.kind !== 'same').map(l => l.text)).toEqual(['Cut on Thursdays.', 'Cut on Fridays.'])
  })

  it('reports a property that is new and one that is gone', () => {
    const d = diffPages(page('R', 'a', 'x', 'status: draft\n'), page('R', 'a', 'x', 'date: 2026-10-20\n'))
    expect(d.fields).toEqual([{ name: 'status', before: 'draft', after: undefined }, { name: 'date', before: undefined, after: '2026-10-20' }])
  })

  it('compares as plain lines when the front matter cannot be read', () => {
    const d = diffPages('---\ntitle: [oops\n---\nx', '---\ntitle: [oops\n---\ny')
    expect(d.fields).toEqual([])
    expect(d.lines.some(l => l.kind === 'add' && l.text === 'y')).toBe(true)
  })
})

describe('authorLabel @SC-1419', () => {
  it('names a person, and an agent with the person it answered', () => {
    expect(authorLabel({ kind: 'person', name: 'Mia' })).toBe('Mia')
    expect(authorLabel({ kind: 'agent', agentName: 'Kernel', forName: 'Sam' })).toBe('Kernel, asked by Sam')
    expect(authorLabel({ kind: 'agent', agentName: 'Kernel', forName: '' })).toBe('Kernel')
  })
})
