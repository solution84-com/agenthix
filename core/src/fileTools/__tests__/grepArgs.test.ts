import { describe, expect, it } from 'vitest'
import { buildRgArgs, checkGrepParams, splitGlobs, type CheckedGrepParams } from '../grepArgs.js'

function checked(input: unknown): CheckedGrepParams {
  const r = checkGrepParams(input)
  if (!r.ok) throw new Error(`refused: ${JSON.stringify(r)}`)
  return r.params
}

describe('Grep parameters', () => {
  it('take Grep\'s defaults: files_with_matches, line numbers on, case-sensitive, offset 0 @SC-1374', () => {
    expect(checked({ pattern: 'a' })).toMatchObject({ output_mode: 'files_with_matches', '-n': true, '-i': false, offset: 0, multiline: false })
  })
  it('allow a pattern of 500 characters and refuse one of 501 @SC-1375', () => {
    expect(checkGrepParams({ pattern: 'a'.repeat(500) }).ok).toBe(true)
    expect(checkGrepParams({ pattern: 'a'.repeat(501) })).toEqual({ ok: false, problem: 'pattern-too-long' })
  })
  it('refuse a value of the wrong kind, naming only the parameter @SC-1375', () => {
    expect(checkGrepParams({ pattern: 1 })).toEqual({ ok: false, problem: 'invalid-parameter', parameter: 'pattern' })
    expect(checkGrepParams({ pattern: 'a', output_mode: 'files' })).toMatchObject({ parameter: 'output_mode' })
    expect(checkGrepParams({ pattern: 'a', '-A': -1 })).toMatchObject({ parameter: '-A' })
    expect(checkGrepParams({ pattern: 'a', '-C': 101 })).toMatchObject({ parameter: '-C' })
    expect(checkGrepParams({ pattern: 'a', head_limit: 1.5 })).toMatchObject({ parameter: 'head_limit' })
    expect(checkGrepParams({ pattern: 'a', '-i': 'yes' })).toMatchObject({ parameter: '-i' })
    expect(checkGrepParams(null)).toMatchObject({ ok: false })
  })
  it('refuse a NUL in the pattern, path or glob @SC-1375', () => {
    expect(checkGrepParams({ pattern: 'a\0b' })).toMatchObject({ parameter: 'pattern' })
    expect(checkGrepParams({ pattern: 'a', path: 'x\0' })).toMatchObject({ parameter: 'path' })
    expect(checkGrepParams({ pattern: 'a', glob: '*\0' })).toMatchObject({ parameter: 'glob' })
  })
})

describe('ripgrep arguments', () => {
  it('always carry the guards: no config, no links, one thread, size and line caps, and no hidden files @SC-1376', () => {
    const args = buildRgArgs(checked({ pattern: 'a' }), '.')
    expect(args).toEqual(expect.arrayContaining(['--no-config', '--no-follow', '--threads=1', '--max-filesize=1M', '--max-columns=500']))
    expect(args).not.toContain('--hidden')
    expect(args.some(a => a.startsWith('--pcre2') || a.startsWith('-P') || a.startsWith('--pre'))).toBe(false)
  })
  it('end with the pattern after -e, then -- before the path @SC-1376', () => {
    const args = buildRgArgs(checked({ pattern: '--pre=sh' }), 'sub')
    expect(args.slice(-4)).toEqual(['-e', '--pre=sh', '--', 'sub'])
  })
  it('keep a glob that looks like a flag inside one --glob= argument @SC-1376', () => {
    const args = buildRgArgs(checked({ pattern: 'a', glob: '--pre=sh *.md' }), '.')
    expect(args).toContain('--glob=--pre=sh')
    expect(args).toContain('--glob=*.md')
    expect(args).not.toContain('--pre=sh')
  })
  it('are built only from Grep\'s parameters: any other key is ignored @SC-1376', () => {
    const plain = buildRgArgs(checked({ pattern: 'a' }), '.')
    const extra = buildRgArgs(checked({ pattern: 'a', '--pre': 'sh', type: 'js', pcre2: true } as unknown), '.')
    expect(extra).toEqual(plain)
  })
  it('map each mode as Grep does @SC-1374', () => {
    expect(buildRgArgs(checked({ pattern: 'a' }), '.')).toEqual(expect.arrayContaining(['--files-with-matches', '--null']))
    expect(buildRgArgs(checked({ pattern: 'a', output_mode: 'count' }), '.')).toEqual(expect.arrayContaining(['--count', '--with-filename', '--null']))
    const content = buildRgArgs(checked({ pattern: 'a', output_mode: 'content', '-i': true, multiline: true, '-A': 2, '-B': 1 }), '.')
    expect(content).toEqual(expect.arrayContaining(['--json', '--line-number', '--ignore-case', '--multiline', '--multiline-dotall', '--before-context=1', '--after-context=2']))
  })
  it('let -C win over -A and -B, and add context only in content mode @SC-1374', () => {
    const c = buildRgArgs(checked({ pattern: 'a', output_mode: 'content', '-C': 3, '-A': 1 }), '.')
    expect(c).toContain('--context=3')
    expect(c.some(a => a.startsWith('--after-context'))).toBe(false)
    expect(buildRgArgs(checked({ pattern: 'a', '-C': 3 }), '.').some(a => a.startsWith('--context'))).toBe(false)
  })
})

describe('Grep\'s glob @SC-1374', () => {
  it('splits on spaces and commas, keeping a brace alternation whole', () => {
    expect(splitGlobs('*.md, *.txt')).toEqual(['*.md', '*.txt'])
    expect(splitGlobs('**/*.{md,txt} !drafts/**')).toEqual(['**/*.{md,txt}', '!drafts/**'])
  })
})
