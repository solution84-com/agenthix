import { describe, it, expect } from 'vitest'
import { commandApproved, getBashPatternState } from '../bashCommandRules'
import type { BashPatternPermission } from '../types'

const rules: BashPatternPermission[] = [
  { pattern: 'git ', state: 'always' },
  { pattern: 'ls ', state: 'always' },
  { pattern: 'cd', state: 'always' },
  { pattern: 'git push', state: 'ask' },
  { pattern: 'rm', state: 'never' },
]
const state = (cmd: string, anyOther: 'always' | 'ask' | 'never' = 'ask') => getBashPatternState(cmd, rules, anyOther)

describe('getBashPatternState: a command line as the shell runs it', () => {
  it('matches a rule by whole words: its trailing space is not lost, and a longer word is another program', () => {
    expect(state('ls -la')).toBe('always')
    expect(state('lsof -i')).toBe('ask')
    expect(state('gitfoo')).toBe('ask')
  })

  it('judges every command of a compound, and a never rule refuses if any part matches', () => {
    for (const cmd of [
      'cd x && rm -rf y', 'ls; rm y', 'ls || rm y', 'ls | rm y', 'ls\nrm y', 'ls $(rm y)', 'ls `rm y`', 'ls & rm y',
    ]) expect(state(cmd, 'always'), cmd).toBe('never')
  })

  it('asks for a compound whose parts are always but one', () => {
    expect(state('cd x && git status')).toBe('always')
    expect(state('cd x && make')).toBe('ask')
  })

  it('binds never and ask whatever the order of the rules', () => {
    expect(state('git push origin')).toBe('ask')
    expect(getBashPatternState('rm x', [{ pattern: 'rm', state: 'always' }, { pattern: 'rm', state: 'never' }], 'ask')).toBe('never')
  })

  it('sees a never command past assignments, a path, wrappers and a shell\'s script', () => {
    for (const cmd of ['FOO=1 rm x', '/bin/rm x', 'env -i rm x', 'nohup rm x', 'timeout 5 rm x', 'sudo -u a rm x', 'bash -c "rm x"', 'sh -lc \'ls; rm x\'', 'eval rm x']) {
      expect(state(cmd, 'always'), cmd).toBe('never')
    }
  })

  it('does not let an always rule be met with an assignment in front, which can run another program', () => {
    expect(getBashPatternState('GIT_SSH_COMMAND="sh -c x" git push', [{ pattern: 'git', state: 'always' }], 'ask')).toBe('ask')
  })

  it('asks for a command whose name is worked out when it runs, where a never rule exists', () => {
    expect(state('$X -rf /', 'always')).toBe('ask')
    expect(getBashPatternState('$X -rf /', [], 'always')).toBe('always')
    expect(state('bash -c "$X"', 'always')).toBe('ask')
  })

  it('treats a line it cannot read as unmatched', () => {
    expect(state('echo "open', 'always')).toBe('ask')
    expect(getBashPatternState('echo "open', [{ pattern: 'git', state: 'always' }], 'always')).toBe('always')
    expect(state('echo "open', 'never')).toBe('never')
  })

  it('takes a rule ending in * as a word prefix, and * alone as every command', () => {
    expect(getBashPatternState('npm run test:unit', [{ pattern: 'npm run test*', state: 'always' }], 'ask')).toBe('always')
    expect(getBashPatternState('anything at all', [{ pattern: '*', state: 'always' }], 'ask')).toBe('always')
  })
})

describe('commandApproved', () => {
  it('grants exactly the command a person approved, nothing that only starts like it', () => {
    expect(commandApproved('npm install sdk@0.9.2', ['npm install sdk@0.9.2'])).toBe(true)
    expect(commandApproved('npm install evil', ['npm install sdk@0.9.2'])).toBe(false)
    expect(commandApproved('npm', ['npm install sdk@0.9.2'])).toBe(false)
    expect(commandApproved('python -c "x"', ['python'])).toBe(false)
  })
})
