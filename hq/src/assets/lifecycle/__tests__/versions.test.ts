import { describe, it, expect } from 'vitest'
import { bySemVerDescending, fileChanges, nextVersion, pinMoveRefusal } from '../versions'

const file = (path: string, text: string) => ({ path, content: Buffer.from(text, 'utf-8') })

describe('the next version a publish makes @SC-1625', () => {
  it('is 1.0.0 for an asset with no version yet', () => {
    expect(nextVersion([], 'minor')).toBe('1.0.0')
    expect(nextVersion([], 'major')).toBe('1.0.0')
  })

  it('is the next minor by default, and the publisher may choose patch or major', () => {
    expect(nextVersion(['1.2.3'], 'minor')).toBe('1.3.0')
    expect(nextVersion(['1.2.3'], 'patch')).toBe('1.2.4')
    expect(nextVersion(['1.2.3'], 'major')).toBe('2.0.0')
  })

  it('counts from the newest version held, not the one in use, so a roll back never makes a version that exists', () => {
    expect(nextVersion(['1.0.0', '1.1.0', '1.2.0'], 'minor')).toBe('1.3.0')
    expect(nextVersion(['1.10.0', '1.9.0'], 'minor')).toBe('1.11.0')
  })

  it('counts from a pre-release by its release numbers', () => {
    expect(nextVersion(['2.0.0-rc.1', '1.4.0'], 'minor')).toBe('2.1.0')
  })
})

describe('versions in order @security-M4 @SC-1619', () => {
  it('sorts by SemVer precedence, newest first, not as text', () => {
    expect(['1.2.0', '1.10.0', '1.9.1', '2.0.0-rc.1', '2.0.0'].sort(bySemVerDescending)).toEqual(['2.0.0', '2.0.0-rc.1', '1.10.0', '1.9.1', '1.2.0'])
  })
})

describe('moving the pin @SC-1619', () => {
  it('lets an update go only to a newer version, and a roll back only to an earlier one', () => {
    expect(pinMoveRefusal('update', '1.2.0', '1.3.0')).toBeNull()
    expect(pinMoveRefusal('rollBack', '1.2.0', '1.0.0')).toBeNull()
    expect(pinMoveRefusal('update', '1.2.0', '1.0.0')).toMatch(/older than the one in use.*Return to this version/)
    expect(pinMoveRefusal('rollBack', '1.2.0', '1.10.0')).toMatch(/newer than the one in use.*Update/)
  })

  it('refuses moving to the version already in use', () => {
    expect(pinMoveRefusal('update', '1.2.0', '1.2.0')).toMatch(/already the one in use. Nothing was changed./)
  })
})

describe('what changed between two versions @SC-1619', () => {
  it('lists every file added, changed and removed, scripts included, in path order', () => {
    const from = [file('SKILL.md', 'a'), file('scripts/run.sh', 'echo 1'), file('references/old.md', 'x')]
    const to = [file('SKILL.md', 'b'), file('scripts/run.sh', 'echo 1'), file('scripts/new.sh', 'rm'), file('references/a.md', 'y')]
    expect(fileChanges(from, to)).toEqual({
      added: ['references/a.md', 'scripts/new.sh'],
      changed: ['SKILL.md'],
      removed: ['references/old.md'],
    })
  })

  it('finds nothing between the same files', () => {
    expect(fileChanges([file('SKILL.md', 'a')], [file('SKILL.md', 'a')])).toEqual({ added: [], changed: [], removed: [] })
  })
})
