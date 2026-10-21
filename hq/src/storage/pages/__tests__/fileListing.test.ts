/** The lists of the Files tools (every screen reviewed spec §3): newest first, grouped by recency, with a kind and size. */
import { describe, it, expect } from 'vitest'
import {
  kindLabel, sizeLabel, kindAndSize, changedLabel, newestFirst, groupByRecency, visibleEntries, filterByName, filterTopics,
  tagsOf, parentOf, joinPath, type ListedEntry,
} from '@agenthix/ui/projects'

// Wednesday 7 October 2026, 12:00 local time.
const NOW = new Date(2026, 9, 7, 12, 0)
const at = (day: number, hour = 9, minute = 0) => new Date(2026, 9, day, hour, minute).toISOString()
const entry = (name: string, modifiedAt?: string, extra: Partial<ListedEntry> = {}): ListedEntry => ({ name, modifiedAt, ...extra })

describe('kind and size', () => {
  it('names the kind from the file name', () => {
    expect(kindLabel('ROADMAP.md')).toBe('Markdown')
    expect(kindLabel('hero.PNG')).toBe('Image')
    expect(kindLabel('pricing.pdf')).toBe('PDF')
    expect(kindLabel('sitemap.csv')).toBe('CSV')
    expect(kindLabel('notes.txt')).toBe('Text')
    expect(kindLabel('app.ts')).toBe('Code')
    expect(kindLabel('LICENSE')).toBe('File')
  })

  it('writes sizes in the unit a person reads', () => {
    expect(sizeLabel(0)).toBe('0 B')
    expect(sizeLabel(512)).toBe('512 B')
    expect(sizeLabel(2048)).toBe('2 KB')
    expect(sizeLabel(1_258_291)).toBe('1.2 MB')
    expect(sizeLabel(220 * 1024)).toBe('220 KB')
  })

  it('joins kind and size, and says Folder for a folder', () => {
    expect(kindAndSize({ name: 'ROADMAP.md', size: 2048 })).toBe('Markdown · 2 KB')
    expect(kindAndSize({ name: 'ROADMAP.md' })).toBe('Markdown')
    expect(kindAndSize({ name: 'specs', isDir: true, size: 4096 })).toBe('Folder')
  })
})

describe('when it changed', () => {
  it('shows the time today, and a weekday within the week', () => {
    expect(changedLabel(at(7, 10, 25), NOW)).toBe('10:25')
    expect(changedLabel(at(6), NOW)).toBe('Yesterday')
    expect(changedLabel(at(5), NOW)).toBe('Mon')
  })

  it('counts weeks after that, then gives the date', () => {
    expect(changedLabel(new Date(2026, 8, 28).toISOString(), NOW)).toBe('last week')
    expect(changedLabel(new Date(2026, 8, 23).toISOString(), NOW)).toBe('2 weeks ago')
    expect(changedLabel(new Date(2026, 7, 30).toISOString(), NOW)).toBe('30 Aug')
  })

  it('is empty for a file with no time', () => {
    expect(changedLabel(undefined, NOW)).toBe('')
  })
})

describe('newest first', () => {
  it('orders by when it changed and puts the unknown last, by name', () => {
    const rows = [entry('b.md', at(1)), entry('z.md'), entry('c.md', at(5)), entry('a.md')]
    expect(newestFirst(rows).map(r => r.name)).toEqual(['c.md', 'b.md', 'a.md', 'z.md'])
  })

  it('does not change the list it is given', () => {
    const rows = [entry('b.md', at(1)), entry('c.md', at(5))]
    newestFirst(rows)
    expect(rows.map(r => r.name)).toEqual(['b.md', 'c.md'])
  })
})

describe('Today, This week, Older', () => {
  it('cuts a list into the three groups and drops the empty ones', () => {
    const rows = [
      entry('today.md', at(7, 9)), entry('mon.md', at(5)), entry('old.md', new Date(2026, 8, 30).toISOString()),
      entry('yesterday.md', at(6)),
    ]
    const groups = groupByRecency(newestFirst(rows), NOW)
    expect(groups.map(g => [g.label, g.entries.map(e => e.name)])).toEqual([
      ['Today', ['today.md']],
      ['This week', ['yesterday.md', 'mon.md']],
      ['Older', ['old.md']],
    ])
    expect(groupByRecency([entry('old.md', new Date(2026, 8, 1).toISOString())], NOW).map(g => g.label)).toEqual(['Older'])
  })

  it('files an entry with no time under Older', () => {
    expect(groupByRecency([entry('x.md')], NOW)[0].label).toBe('Older')
  })
})

describe('what Files shows', () => {
  it('leaves out hidden names such as the agents’ own folder', () => {
    expect(visibleEntries([entry('.agents'), entry('AGENTS.md'), entry('.git'), entry('specs', undefined, { isDir: true })]).map(e => e.name))
      .toEqual(['AGENTS.md', 'specs'])
  })

  it('searches names without minding case', () => {
    expect(filterByName([entry('ROADMAP.md'), entry('specs')], 'road').map(e => e.name)).toEqual(['ROADMAP.md'])
    expect(filterByName([entry('a.md')], '  ')).toHaveLength(1)
  })

  it('searches topics by title, summary and tags, and filters by tag', () => {
    const topics = [
      { path: 'payments.md', title: 'Payments', summary: 'Stripe Checkout', tags: ['stack'], modifiedAt: at(5) },
      { path: 'brand.md', title: 'Brand voice', summary: 'Tone and words', tags: [], modifiedAt: at(4) },
    ]
    expect(filterTopics(topics, { query: 'stripe', tag: '' }).map(t => t.title)).toEqual(['Payments'])
    expect(filterTopics(topics, { query: '', tag: 'stack' }).map(t => t.title)).toEqual(['Payments'])
    expect(filterTopics(topics, { query: '', tag: '' })).toHaveLength(2)
    expect(tagsOf(topics)).toEqual(['stack'])
  })
})

describe('paths', () => {
  it('joins and splits them', () => {
    expect(joinPath('', 'a.md')).toBe('a.md')
    expect(joinPath('specs', 'a.md')).toBe('specs/a.md')
    expect(parentOf('specs/a.md')).toBe('specs')
    expect(parentOf('a.md')).toBe('')
  })
})
