import { describe, it, expect } from 'vitest'
import { MEMORY_BODY_MAX_CHARS, MEMORY_MAX_TAGS } from '../../shared/memory/protocol'
import { STAND_ALONE_REFUSAL, cleanItem, duplicateAction, embeddingText, itemRefusal, keyFrom, nearDuplicatePlan } from '../items'

const item = (title: string, body: string, tags?: string[]) => cleanItem({ title, body, tags })

describe('an item must stand alone @SC-2103', () => {
  it('keeps an item whose title and body name their subject', () => {
    expect(itemRefusal(item('Release day', 'The team ships the weekly release on Thursday afternoons.'))).toBeNull()
  })

  it.each([
    ['no title', '', 'The team ships the weekly release on Thursday afternoons.'],
    ['a body of a few words', 'Release', 'Thursday.'],
    ['a body that only points elsewhere', 'That', 'Do it like that again, as before.'],
    ['a pronoun reference', 'It', 'They said to do this the same way next time.'],
  ])('refuses %s, and says what a memory needs', (_what, title, body) => {
    expect(itemRefusal(item(title, body))).toBe(STAND_ALONE_REFUSAL)
  })

  it('refuses a body over the cap, sending longer material to the place\'s files', () => {
    const refusal = itemRefusal(item('Notes', 'word '.repeat(MEMORY_BODY_MAX_CHARS)))
    expect(refusal).toMatch(/not a document/)
    expect(refusal).toMatch(/place's files/)
  })
})

describe('cleaning an item @SC-2103', () => {
  it('puts the title on one line, keeps the body\'s line breaks, and drops control characters', () => {
    const cleaned = item('  Release\n\tday ', 'First line.\r\n\r\n\r\n\r\nSecond\u0007 line.', ['  Ops ', 'ops', 'Deploy'])
    expect(cleaned.title).toBe('Release day')
    expect(cleaned.body).toBe('First line.\n\nSecond line.')
    expect(cleaned.tags).toEqual(['ops', 'deploy'])
  })

  it('keeps at most the tags an item may carry', () => {
    expect(item('t', 'b', Array.from({ length: 20 }, (_, i) => `tag${i}`)).tags).toHaveLength(MEMORY_MAX_TAGS)
  })

  it('embeds title, body and tags together', () => {
    expect(embeddingText(item('Release day', 'Thursdays.', ['ops']))).toBe('Release day\nThursdays.\nops')
  })
})

describe('keys @SC-2103', () => {
  it('come from the title as a slug', () => {
    expect(keyFrom('Café — Release day!')).toBe('cafe-release-day')
  })

  it('are never empty, even for a title with no letters a slug keeps', () => {
    expect(keyFrom('日本語')).toMatch(/^item-[0-9a-f]{10}$/)
    expect(keyFrom('日本語')).toBe(keyFrom('日本語'))
  })

  it('are cut to a bounded length', () => {
    expect(keyFrom('word '.repeat(50)).length).toBeLessThanOrEqual(64)
    expect(keyFrom('word '.repeat(50)).endsWith('-')).toBe(false)
  })
})

describe('a near-duplicate @SC-2104', () => {
  const held = { kind: 'FACT' as const, body: 'The team ships the weekly release on Thursday afternoons.' }

  it('changes nothing when the item held already says it', () => {
    expect(duplicateAction({ kind: 'FACT', body: 'the team ships the weekly release' }, held)).toEqual({ action: 'held' })
  })

  it('supersedes when the new item says everything the old one did', () => {
    expect(duplicateAction({ kind: 'FACT', body: `${held.body} From main.` }, held)).toEqual({ action: 'supersede' })
  })

  it('replaces the old memory with a newer Rule, even when the two would fit in one', () => {
    expect(duplicateAction({ kind: 'RULE', body: 'Ships on Wednesdays now.' }, { kind: 'RULE', body: held.body })).toEqual({ action: 'supersede' })
  })

  it('changes nothing for a Rule the old one already says', () => {
    expect(duplicateAction({ kind: 'RULE', body: 'the team ships the weekly release' }, { kind: 'RULE', body: held.body })).toEqual({ action: 'held' })
  })

  it('joins a Fact only onto a Fact: beside a Rule it replaces instead', () => {
    expect(duplicateAction({ kind: 'FACT', body: 'Releases go out from main.' }, { kind: 'RULE', body: held.body })).toEqual({ action: 'supersede' })
  })

  it('merges a fact that adds to the old one, when both fit in one item', () => {
    expect(duplicateAction({ kind: 'FACT', body: 'Releases go out from main.' }, held))
      .toEqual({ action: 'merge', body: `${held.body}\nReleases go out from main.` })
  })

  it('supersedes instead of merging when the two would not fit in one item', () => {
    const long = { kind: 'FACT' as const, body: 'x'.repeat(MEMORY_BODY_MAX_CHARS - 10) }
    expect(duplicateAction({ kind: 'FACT', body: 'Another detail entirely.' }, long)).toEqual({ action: 'supersede' })
  })
})

describe('a near-duplicate in a wider scope than the saving one @SC-2104', () => {
  const narrow = { wider: false, kind: 'FACT' as const, requested: false }
  const wider = { wider: true, kind: 'FACT' as const, requested: false }

  it('acts as the near-duplicate rule says when the memory found is in the saving scope', () => {
    expect(nearDuplicatePlan({ action: 'held' }, narrow)).toEqual({ plan: 'held' })
    expect(nearDuplicatePlan({ action: 'merge', body: 'a\nb' }, narrow)).toEqual({ plan: 'merge', body: 'a\nb' })
    expect(nearDuplicatePlan({ action: 'supersede' }, narrow)).toEqual({ plan: 'supersede', inHeldScope: true })
  })

  it('changes nothing when the wider memory already says it', () => {
    expect(nearDuplicatePlan({ action: 'held' }, wider)).toEqual({ plan: 'held' })
  })

  it('never writes into the wider memory: a Fact that would join it is saved on its own in the saving scope', () => {
    expect(nearDuplicatePlan({ action: 'merge', body: 'a\nb' }, wider)).toEqual({ plan: 'add' })
  })

  it('replaces the wider memory where it holds only with a Rule the person asked for', () => {
    expect(nearDuplicatePlan({ action: 'supersede' }, { wider: true, kind: 'RULE', requested: true })).toEqual({ plan: 'supersede', inHeldScope: true })
  })

  it('saves anything else in the saving scope and leaves the wider memory live', () => {
    expect(nearDuplicatePlan({ action: 'supersede' }, { wider: true, kind: 'RULE', requested: false })).toEqual({ plan: 'add' })
    expect(nearDuplicatePlan({ action: 'supersede' }, { wider: true, kind: 'FACT', requested: true })).toEqual({ plan: 'add' })
    expect(nearDuplicatePlan({ action: 'supersede' }, wider)).toEqual({ plan: 'add' })
  })
})
