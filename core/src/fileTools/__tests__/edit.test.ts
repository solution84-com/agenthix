import { describe, expect, it } from 'vitest'
import { applyEdit } from '../edit.js'

describe('applyEdit: exact matching @SC-1372', () => {
  it('replaces the one exact occurrence', () => {
    expect(applyEdit('a\nStaging goes out.\nb\n', { old_string: 'Staging goes out.', new_string: 'Staging waits.' }))
      .toEqual({ ok: true, text: 'a\nStaging waits.\nb\n', replacements: 1 })
  })

  it('refuses a passage that is absent, and does not match loosely', () => {
    expect(applyEdit('  indented line\n', { old_string: 'indented  line', new_string: 'x' }))
      .toEqual({ ok: false, reason: 'edit-not-found', count: 0 })
    expect(applyEdit('Hello\r\nworld', { old_string: 'Hello\nworld', new_string: 'x' }))
      .toMatchObject({ ok: false, reason: 'edit-not-found' })
  })

  it('refuses a passage found more than once without replace_all, saying how many times', () => {
    expect(applyEdit('x y x y x', { old_string: 'x', new_string: 'z' })).toEqual({ ok: false, reason: 'edit-ambiguous', count: 3 })
  })

  it('replaces every occurrence with replace_all', () => {
    expect(applyEdit('x y x y x', { old_string: 'x', new_string: 'z', replace_all: true }))
      .toEqual({ ok: true, text: 'z y z y z', replacements: 3 })
  })

  it('counts occurrences without overlap', () => {
    expect(applyEdit('aaaa', { old_string: 'aa', new_string: 'b', replace_all: true })).toEqual({ ok: true, text: 'bb', replacements: 2 })
  })

  it('refuses old_string equal to new_string, and an empty old_string', () => {
    expect(applyEdit('same', { old_string: 'same', new_string: 'same' })).toMatchObject({ ok: false, reason: 'edit-no-change' })
    expect(applyEdit('text', { old_string: '', new_string: 'x' })).toMatchObject({ ok: false, reason: 'edit-empty' })
  })

  it('refuses arguments that are not text', () => {
    expect(applyEdit('a', { old_string: 1 as unknown as string, new_string: 'b' })).toMatchObject({ ok: false, reason: 'invalid-argument' })
  })

  it('takes the replacement literally, never as a pattern', () => {
    expect(applyEdit('cost: X', { old_string: 'X', new_string: "$& $1 $$ $'" }))
      .toEqual({ ok: true, text: "cost: $& $1 $$ $'", replacements: 1 })
  })
})
