import { describe, it, expect } from 'vitest'
import { DIFF_TEXT_LIMIT, diffFiles } from '../pageDiff'

const file = (path: string, text: string) => ({ path, content: Buffer.from(text, 'utf-8') })

describe('what changed between two versions, file by file @SC-1632', () => {
  it('lists added, modified and removed files, and leaves out an unchanged one', () => {
    const changes = diffFiles(
      [file('SKILL.md', 'one\n'), file('old.md', 'gone\n'), file('same.md', 'same\n')],
      [file('SKILL.md', 'one\ntwo\n'), file('new.md', 'hello\n'), file('same.md', 'same\n')],
    )
    expect(changes.map(c => [c.path, c.status])).toEqual([['SKILL.md', 'modified'], ['new.md', 'added'], ['old.md', 'removed']])
    expect(changes[0]).toMatchObject({ before: 'one\n', after: 'one\ntwo\n', binary: false })
    expect(changes[1]).toMatchObject({ before: null, after: 'hello\n' })
    expect(changes[2]).toMatchObject({ before: 'gone\n', after: null })
  })

  it('lists a binary file, or one too large to read by line, as changed without its lines', () => {
    const png = { path: 'logo.png', content: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 1, 2]) }
    const big = file('big.txt', 'x'.repeat(DIFF_TEXT_LIMIT + 1))
    const changes = diffFiles([], [png, big])
    expect(changes).toEqual([
      { path: 'big.txt', status: 'added', before: null, after: null, binary: true },
      { path: 'logo.png', status: 'added', before: null, after: null, binary: true },
    ])
  })

  it('is empty when nothing changed', () => {
    expect(diffFiles([file('a.md', 'x')], [file('a.md', 'x')])).toEqual([])
  })
})

describe('the version before (board *A skill\'s page* 6) @SC-1632', () => {
  it('is the newest of the older versions by SemVer, and none for the first', async () => {
    const { versionBefore } = await import('../pageDiff')
    const held = [{ version: '1.10.0' }, { version: '1.2.0' }, { version: '1.0.0' }, { version: '2.0.0' }]
    expect(versionBefore(held, '2.0.0')?.version).toBe('1.10.0')
    expect(versionBefore(held, '1.2.0')?.version).toBe('1.0.0')
    expect(versionBefore(held, '1.0.0')).toBeNull()
  })
})
