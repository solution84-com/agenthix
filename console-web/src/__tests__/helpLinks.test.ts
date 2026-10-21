import { describe, expect, it } from 'vitest'
import { isTopicId } from '../pages/help/topicIds'
import { topicOf } from '../pages/help/topics'

// Every place a screen links to Help: read from the pages' source, so a link added later is checked too.
const SOURCES = import.meta.glob('../pages/**/*.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const LINK = /<HowThisWorks\s+topic="([^"]+)"(?:\s+section="([^"]+)")?/g

const placed = Object.entries(SOURCES).flatMap(([file, source]) => [...source.matchAll(LINK)].map(m => ({ file, topic: m[1], section: m[2] })))

describe('the How this works links @SC-919', () => {
  it('are placed on the screens', () => {
    expect(placed.length).toBeGreaterThanOrEqual(10)
  })

  it.each(placed.map(p => [`${p.file} -> ${p.topic}${p.section ? `#${p.section}` : ''}`, p] as const))('%s names a real topic and section', (_name, p) => {
    expect(isTopicId(p.topic)).toBe(true)
    if (!isTopicId(p.topic) || !p.section) return
    const ids = topicOf(p.topic).blocks.flatMap(b => (b.t === 'heading' ? [b.id] : []))
    expect(ids).toContain(p.section)
  })
})
