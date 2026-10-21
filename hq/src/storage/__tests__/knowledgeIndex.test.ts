/**
 * Agents keep `knowledge/INDEX.md` with one line per topic file. How that line
 * is written is not settled, so the parser takes the shapes agents
 * write and never guesses: a line it cannot tie to a file says nothing.
 */
import { describe, it, expect } from 'vitest'
import { parseKnowledgeIndex, knowledgeTopics } from '../knowledgeIndex'

describe('parseKnowledgeIndex', () => {
  it('reads a Markdown link as the title and what follows as the summary', () => {
    const index = parseKnowledgeIndex([
      '# Knowledge',
      '',
      '- [How sign-in works](auth.md) — sessions, cookies and the CSRF token',
      '* [Hosting](decisions/hosting.md): why one machine per organisation',
      '1. [Pricing](./pricing.md) - what we charge',
    ].join('\n'))
    expect(index.get('auth.md')).toEqual({ title: 'How sign-in works', summary: 'sessions, cookies and the CSRF token' })
    expect(index.get('decisions/hosting.md')).toEqual({ title: 'Hosting', summary: 'why one machine per organisation' })
    expect(index.get('pricing.md')).toEqual({ title: 'Pricing', summary: 'what we charge' })
  })

  it('reads a bare or code-quoted file name, leaving the title to the caller', () => {
    const index = parseKnowledgeIndex('- `stack.md` — TypeScript, Wasp and Postgres\n- people.md: who does what\n')
    expect(index.get('stack.md')).toEqual({ title: null, summary: 'TypeScript, Wasp and Postgres' })
    expect(index.get('people.md')).toEqual({ title: null, summary: 'who does what' })
  })

  it('keeps a link with no summary, and drops an anchor or a link title from the address', () => {
    const index = parseKnowledgeIndex('- [Auth](auth.md#cookies "the cookie part")\n')
    expect(index.get('auth.md')).toEqual({ title: 'Auth', summary: '' })
  })

  it('ignores headings, prose, external links and paths that climb out', () => {
    const index = parseKnowledgeIndex([
      '# Index',
      'Some prose about the index.',
      '- [Docs](https://example.com/docs.md) — external',
      '- [Escape](../files/AGENTS.md) — not knowledge',
      '- [Root](/etc/passwd.md) — absolute',
    ].join('\n'))
    expect([...index.keys()]).toEqual([])
  })

  it('takes the first line for a file named twice', () => {
    const index = parseKnowledgeIndex('- [First](a.md) — one\n- [Second](a.md) — two\n')
    expect(index.get('a.md')?.title).toBe('First')
  })

  it('decodes an escaped address', () => {
    expect(parseKnowledgeIndex('- [Notes](team%20notes.md)').get('team notes.md')?.title).toBe('Notes')
  })
})

describe('knowledgeTopics', () => {
  const files = [
    { path: 'INDEX.md', size: 10, modifiedAt: '2026-01-04T00:00:00.000Z' },
    { path: 'old.md', size: 1, modifiedAt: '2026-01-01T00:00:00.000Z' },
    { path: 'decisions/hosting.md', size: 1, modifiedAt: '2026-01-03T00:00:00.000Z' },
    { path: 'auth.md', size: 1, modifiedAt: '2026-01-02T00:00:00.000Z' },
  ]

  it('lists every file but the index, newest first, titled from the index or else by file name', () => {
    const topics = knowledgeTopics(files, '- [How sign-in works](auth.md) — sessions\n- `old.md` — the old way\n')
    expect(topics).toEqual([
      { path: 'decisions/hosting.md', title: 'hosting.md', summary: '', tags: [], modifiedAt: '2026-01-03T00:00:00.000Z' },
      { path: 'auth.md', title: 'How sign-in works', summary: 'sessions', tags: [], modifiedAt: '2026-01-02T00:00:00.000Z' },
      { path: 'old.md', title: 'old.md', summary: 'the old way', tags: [], modifiedAt: '2026-01-01T00:00:00.000Z' },
    ])
  })

  it('titles every topic by its file name when there is no index', () => {
    expect(knowledgeTopics(files, null).map(t => t.title)).toEqual(['hosting.md', 'auth.md', 'old.md'])
  })
})
