import { describe, expect, it } from 'vitest'
import { snapshotOf } from './protocolSnapshot/fixture.js'
import { judge, parseDeprecationMark } from './protocolSnapshot/rules.js'

const run = (mark: string | null, version: string, extra = '') => snapshotOf({
  'index.ts': `
    export type Run = {
      id: string
      ${mark === null ? '' : `/** @deprecated ${mark} */`}
      page?: number
      ${extra}
    }
  `,
}, version)

describe('the deprecation mark\'s form @SC-1134', () => {
  it('reads "since", "stops working in" two majors on, and the replacement or that there is none', () => {
    expect(parseDeprecationMark('since 1.4; stops working in 3.0. Use `runPage` instead.'))
      .toEqual({ since: { major: 1, minor: 4 }, stopsMajor: 3, replacement: 'runPage' })
    expect(parseDeprecationMark('since 2.0; stops working in 4.0. Nothing replaces it.'))
      .toEqual({ since: { major: 2, minor: 0 }, stopsMajor: 4, replacement: null })
  })

  it.each([
    ['no "stops working"', 'since 1.4. Use `runPage` instead.'],
    ['no replacement', 'since 1.4; stops working in 3.0.'],
    ['no "since"', 'stops working in 3.0. Use `runPage` instead.'],
    ['a bare mark', ''],
    ['free words', 'use runPage'],
  ])('refuses a mark with %s', (_, mark) => {
    expect(parseDeprecationMark(mark)).toHaveProperty('error')
  })

  it('refuses a "stops working" that is not two majors after "since"', () => {
    const m = parseDeprecationMark('since 1.4; stops working in 2.0. Use `runPage` instead.')
    expect(m).toEqual({ error: expect.stringMatching(/stops working in 3\.0, two majors on, not 2\.0/) })
  })

  it('is read from a field and a type, collapsed onto one line', () => {
    const s = snapshotOf({
      'index.ts': `
        /**
         * @deprecated since 1.0; stops working in
         * 3.0. Nothing replaces it.
         */
        export type Old = {
          /** The page. @deprecated since 1.0; stops working in 3.0. Use \`cursor\` instead. */
          page?: number
        }
      `,
    })
    expect(s.types.Old.deprecated).toBe('since 1.0; stops working in 3.0. Nothing replaces it.')
    expect(s.types.Old.shape).toEqual({
      fields: { page: { type: { type: 'number' }, optional: true, deprecated: 'since 1.0; stops working in 3.0. Use `cursor` instead.' } },
    })
  })
})

describe('the rules a mark is checked by @SC-1134', () => {
  const MARK = 'since 1.1; stops working in 3.0. Use `cursor` instead.'

  it('a malformed mark fails, wherever it is', () => {
    const v = judge(run(null, '1.0'), run('since 1.1. Use `cursor` instead.', '1.1'))
    expect(v.problems.join()).toMatch(/Run\.page: the mark must read/)
  })

  it('a new mark is an addition, named for the version it ships in', () => {
    expect(judge(run(null, '1.0'), run(MARK, '1.0')).problems.join()).toMatch(/the version must become 1\.1/)
    expect(judge(run(null, '1.0'), run(MARK, '1.1')).problems).toEqual([])
    const late = judge(run(null, '1.0'), run(MARK.replace('1.1', '1.2'), '1.1'))
    expect(late.problems.join()).toMatch(/Run\.page is newly deprecated, so its mark names the version it ships in: since 1\.1, not 1\.2/)
  })

  it('past its "since" major, the deprecated thing leaves the current code', () => {
    const kept = judge(run(MARK, '1.1'), run(MARK, '2.0'))
    expect(kept.problems.join()).toMatch(/Run\.page has been deprecated since 1\.1 and the major is now 2: it must leave the current code/)

    const removed = judge(run(MARK, '1.1'), snapshotOf({ 'index.ts': 'export type Run = { id: string }' }, '2.0'))
    expect(removed.problems).toEqual([])
  })

  it('at its "stops working" version, it is gone from the previous major\'s code too', () => {
    const previous = run(MARK, '1.1')
    const now = snapshotOf({ 'index.ts': 'export type Run = { id: string }' }, '3.0')
    const before = snapshotOf({ 'index.ts': 'export type Run = { id: string }' }, '2.0')
    expect(judge(before, now, previous).problems.join())
      .toMatch(/Run\.page, in the code for the previous major, stopped working in 3\.0: it must be gone/)
    expect(judge(before, now, null).problems).toEqual([])
    // Still in the previous major's code at 2.x is where it belongs.
    expect(judge(before, snapshotOf({ 'index.ts': 'export type Run = { id: string }' }, '2.1'), previous).problems).toEqual([])
  })

  it('still in the current code at its "stops working" version: gone, and its peers refused', () => {
    const v = judge(run(MARK, '1.1'), run(MARK, '3.0'))
    expect(v.problems.join()).toMatch(/Run\.page stopped working in 3\.0: it must be gone, and peers still on 1\.x refused/)
  })
})

describe('something leaves only after it was deprecated @SC-1134', () => {
  const MARK = 'since 1.1; stops working in 3.0. Nothing replaces it.'
  const UNMARKED = /was removed without being deprecated first/

  it('a field gone from the code needs a mark in the committed snapshot, whatever the version', () => {
    const gone = snapshotOf({ 'index.ts': 'export type Run = { id: string }' }, '2.0')
    const unmarked = judge(run(null, '1.0'), gone)
    expect(unmarked.problems.join()).toMatch(/Run\.page was removed without being deprecated first/)
    expect(judge(run(MARK, '1.1'), gone).problems).toEqual([])
  })

  it('a type gone from the code needs a mark on the type', () => {
    const before = (mark: string) => snapshotOf({ 'index.ts': `${mark}\nexport type Old = { id: string }\nexport type Run = { id: string }` }, '1.1')
    const now = snapshotOf({ 'index.ts': 'export type Run = { id: string }' }, '2.0')
    expect(judge(before(''), now).problems.join()).toMatch(/Old was removed without being deprecated first/)
    expect(judge(before(`/** @deprecated ${MARK} */`), now).problems).toEqual([])
  })

  it('a named message gone from a union needs a mark on its type', () => {
    const before = (mark: string) => snapshotOf({
      'index.ts': `
        export type A = { t: 'a' }
        ${mark}
        export type B = { t: 'b' }
        export type Frame = A | B
      `,
    }, '1.1')
    const now = snapshotOf({ 'index.ts': `export type A = { t: 'a' }\nexport type Frame = A` }, '2.0')
    const unmarked = judge(before(''), now).problems.filter(p => UNMARKED.test(p))
    expect(unmarked.join()).toMatch(/Frame was removed|B was removed/)
    expect(judge(before(`/** @deprecated ${MARK} */`), now).problems).toEqual([])
  })

  it('a literal value, which cannot carry a mark, needs only the major move', () => {
    const before = snapshotOf({ 'index.ts': `export type Kind = { kind: 'a' | 'b' }` }, '1.1')
    const now = (v: string) => snapshotOf({ 'index.ts': `export type Kind = { kind: 'a' }` }, v)
    expect(judge(before, now('2.0')).problems).toEqual([])
    expect(judge(before, now('1.2')).problems.join()).toMatch(/the major must move/)
  })

  it('a marked field removed without the major moving still fails on the version', () => {
    const v = judge(run(MARK, '1.1'), snapshotOf({ 'index.ts': 'export type Run = { id: string }' }, '1.2'))
    expect(v.problems.join()).toMatch(/the major must move: the version must become 2\.0/)
    expect(v.problems.join()).not.toMatch(UNMARKED)
  })
})
