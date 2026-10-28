import { describe, expect, it } from 'vitest'
import type { PackageFile } from '../../../../library/packages/packageZip'
import { changesBetween, fileViews } from '../changes'
import { filesToSend, isEdited, liveChanges } from '../liveChanges'

const f = (path: string, text: string | Buffer): PackageFile => ({ path, content: Buffer.isBuffer(text) ? text : Buffer.from(text) })

describe('what a proposal changes @SC-1663', () => {
  it('lists every file added, modified or removed, scripts included, and none that is unchanged', () => {
    const current = [f('SKILL.md', 'one\ntwo'), f('notes.md', 'same'), f('old.md', 'gone')]
    const proposed = [f('SKILL.md', 'one\ntwo\nthree'), f('notes.md', 'same'), f('scripts/check.sh', 'curl x')]
    expect(changesBetween(current, proposed).map(c => [c.path, c.status])).toEqual([
      ['SKILL.md', 'modified'], ['old.md', 'removed'], ['scripts/check.sh', 'added'],
    ])
  })

  it('treats a new skill as all added, and marks a file that is not text as binary', () => {
    const changes = changesBetween(null, [f('SKILL.md', 'x'), f('logo.png', Buffer.from([0xff, 0xfe, 0x00]))])
    expect(changes.every(c => c.status === 'added')).toBe(true)
    expect(changes.find(c => c.path === 'logo.png')).toMatchObject({ binary: true, after: null })
    expect(fileViews([f('a.md', 'é')])[0]).toMatchObject({ text: 'é', base64: Buffer.from('é').toString('base64') })
  })
})

describe('the reviewer\'s edits laid over a proposal (edit, then accept) @SC-1663', () => {
  const files = fileViews([f('SKILL.md', 'one\ntwo\nthree'), f('notes.md', 'same')])
  const changes = changesBetween([f('SKILL.md', 'one\ntwo'), f('notes.md', 'same')], [f('SKILL.md', 'one\ntwo\nthree'), f('notes.md', 'same')])

  it('shows the proposal as it is when nothing is edited', () => {
    expect(liveChanges(changes, files, {}).map(c => [c.path, c.status, c.before, c.after])).toEqual([['SKILL.md', 'modified', 'one\ntwo', 'one\ntwo\nthree']])
    expect(isEdited(files, {})).toBe(false)
  })

  it('compares an edit with what is in use, and brings an untouched file in once it is edited', () => {
    const edits = { 'SKILL.md': 'one\ntwo', 'notes.md': 'changed' }
    const live = liveChanges(changes, files, edits)
    expect(live.map(c => c.path)).toEqual(['notes.md'])
    expect(live[0]).toMatchObject({ status: 'modified', before: 'same', after: 'changed' })
    expect(isEdited(files, edits)).toBe(true)
  })

  it('sends the edited text, and the bytes of every other file', () => {
    expect(filesToSend(files, { 'SKILL.md': 'edited' })).toEqual([
      { path: 'SKILL.md', text: 'edited' }, { path: 'notes.md', base64: Buffer.from('same').toString('base64') },
    ])
  })
})
