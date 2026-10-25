// Runs the real ripgrep found on PATH (never through a shell), and stand-in programs for what ripgrep can't be made
// to do on demand (run slowly, show its arguments).
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { grep, type GrepLogEntry, type GrepOptions, type GrepResult } from '../grep.js'
import { formatGrepResult } from '../grepOutput.js'
import { GrepRateLimiter } from '../grepGuards.js'

// Skipped on a machine without ripgrep; CI installs it, and there a missing ripgrep fails these tests instead.
const RG_ON_PATH = Boolean(process.env.CI) || (process.env.PATH ?? '').split(path.delimiter).some(d => d && fs.existsSync(path.join(d, 'rg')))

let base: string
let root: string
let outside: string

const opts = (over: GrepOptions = {}): GrepOptions => ({ limiter: new GrepRateLimiter(1000), ...over })
const text = (r: GrepResult) => (r.ok ? formatGrepResult(r) : `REFUSED ${r.reason}: ${r.message}`)

function write(file: string, content: string, mtimeSec?: number): void {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, content)
  if (mtimeSec !== undefined) fs.utimesSync(file, mtimeSec, mtimeSec)
}

function program(name: string, body: string): string {
  const file = path.join(base, 'bin', name)
  write(file, `#!/bin/sh\n${body}\n`)
  fs.chmodSync(file, 0o755)
  return file
}

beforeAll(() => {
  base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'grep-test-')))
  root = path.join(base, 'root')
  outside = path.join(base, 'outside')
  write(path.join(root, 'processes/release.md'), '# Release\n\nStaging deploys go out after the checks pass.\nThen production.\n', 1_000)
  write(path.join(root, 'decisions/one.md'), '---\nstatus: proposed\n---\nStaging first.\n', 2_000)
  write(path.join(root, '.hidden.md'), 'Staging secret\n', 3_000)
  write(path.join(outside, 'private.md'), 'Staging outside\n')
  fs.symlinkSync(outside, path.join(root, 'linked'))
  fs.symlinkSync(path.join(outside, 'private.md'), path.join(root, 'linked.md'))
})

afterAll(() => {
  fs.rmSync(base, { recursive: true, force: true })
})

describe.skipIf(!RG_ON_PATH)('grep by ripgrep: Grep\'s modes @SC-1374', () => {
  it('files_with_matches lists files newest first, relative to the root', async () => {
    expect(text(await grep(root, { pattern: 'Staging' }, opts()))).toBe('Found 2 files\ndecisions/one.md\nprocesses/release.md')
  })
  it('content gives file:line:text, with context and breaks', async () => {
    const r = await grep(root, { pattern: 'Staging', output_mode: 'content', '-A': 1 }, opts())
    expect(text(r)).toBe(
      'decisions/one.md:4:Staging first.\n--\nprocesses/release.md:3:Staging deploys go out after the checks pass.\nprocesses/release.md-4-Then production.',
    )
  })
  it('searches front matter, case-insensitively when asked', async () => {
    const r = await grep(root, { pattern: 'STATUS:\\s*proposed', output_mode: 'content', '-i': true }, opts())
    expect(text(r)).toBe('decisions/one.md:2:status: proposed')
  })
  it('count gives file:N and the total', async () => {
    expect(text(await grep(root, { pattern: 'Staging|production', output_mode: 'count' }, opts()))).toBe(
      'decisions/one.md:1\nprocesses/release.md:2\nFound 3 total occurrences across 2 files.',
    )
  })
  it('narrows by path and glob, and pages with head_limit and offset', async () => {
    expect(text(await grep(root, { pattern: 'Staging', path: 'processes' }, opts()))).toBe('Found 1 file\nprocesses/release.md')
    expect(text(await grep(root, { pattern: 'Staging', glob: 'decisions/**' }, opts()))).toBe('Found 1 file\ndecisions/one.md')
    const r = await grep(root, { pattern: '.', output_mode: 'content', head_limit: 2, offset: 1 }, opts())
    expect(r).toMatchObject({ ok: true, appliedLimit: 2, appliedOffset: 1, nextOffset: 3 })
  })
  it('matches across lines with multiline', async () => {
    const r = await grep(root, { pattern: 'pass\\.\\nThen', output_mode: 'content', multiline: true }, opts())
    expect(text(r)).toBe('processes/release.md:3:Staging deploys go out after the checks pass.\nprocesses/release.md:4:Then production.')
  })
})

describe.skipIf(!RG_ON_PATH)('grep\'s guards', () => {
  it('leaves out hidden files and never follows a link inside the root (S2b, S3) @SC-1374 @SC-1376', async () => {
    const r = await grep(root, { pattern: 'Staging', output_mode: 'content' }, opts())
    expect(text(r)).not.toMatch(/secret|outside/)
  })
  it('refuses a path leaving the root, an absolute path, and a path through a link (S3) @SC-1376', async () => {
    for (const [p, reason] of [['../outside', 'outside-root'], [outside, 'outside-root'], ['linked', 'link'], ['linked.md', 'link'], ['nope', 'not-found']]) {
      expect(await grep(root, { pattern: 'Staging', path: p }, opts())).toMatchObject({ ok: false, reason })
    }
  })
  it('refuses look-around and backreferences with ripgrep\'s words, and other bad patterns with a fixed message (S1) @SC-1375', async () => {
    const look = await grep(root, { pattern: 'Staging(?= deploys)' }, opts())
    expect(look).toMatchObject({ ok: false, reason: 'pattern-look-around' })
    expect(text(look)).toContain('look-around, including look-ahead and look-behind, is not supported')
    expect(text(look)).not.toContain('Staging')
    expect(await grep(root, { pattern: '(a)\\1' }, opts())).toMatchObject({ ok: false, reason: 'pattern-backreference' })
    const bad = await grep(root, { pattern: '(unclosed' }, opts())
    expect(bad).toMatchObject({ ok: false, reason: 'pattern-invalid' })
    expect(text(bad)).not.toContain('unclosed')
  })
  it('refuses a pattern over 500 characters before running anything (S2) @SC-1375', async () => {
    const r = await grep(root, { pattern: 'a'.repeat(501) }, opts({ rgPath: '/nonexistent/rg' }))
    expect(r).toMatchObject({ ok: false, reason: 'pattern-too-long' })
  })
  it('runs a backtracking pattern in linear time (S1) @SC-1375', async () => {
    write(path.join(root, 'long.md'), 'a'.repeat(5000) + '!\n')
    const t = Date.now()
    const r = await grep(root, { pattern: '(a+)+$', path: 'long.md' }, opts())
    expect(r.ok).toBe(true)
    expect(Date.now() - t).toBeLessThan(2000)
    fs.rmSync(path.join(root, 'long.md'))
  })
  it('treats a flag in the pattern or glob as text, and never runs a shell (S2b) @SC-1376', async () => {
    const marker = path.join(base, 'pwned')
    for (const pattern of ['--pre=/bin/sh', `$(touch ${marker})`, `; touch ${marker}`, '`touch ' + marker + '`', '-e', '--files']) {
      const r = await grep(root, { pattern, glob: `--pre=/bin/sh $(touch ${marker})` }, opts())
      expect(r.ok, pattern).toBe(true)
    }
    expect(fs.existsSync(marker)).toBe(false)
  })
})

describe('grep\'s guards, with a stand-in for ripgrep', () => {
  it('passes the pattern as one argument after -e, then -- and the path, with no shell between @SC-1376', async () => {
    const argv = path.join(base, 'argv.txt')
    const rg = program('rg-argv', `for a in "$@"; do printf '%s\\n' "$a"; done > '${argv}'`)
    await grep(root, { pattern: 'a; touch x $(id) `id`', path: 'processes' }, opts({ rgPath: rg }))
    const args = fs.readFileSync(argv, 'utf8').trimEnd().split('\n')
    expect(args.slice(-4)).toEqual(['-e', 'a; touch x $(id) `id`', '--', 'processes'])
    expect(args).toContain('--no-config')
  })
  it('stops a search after 2 seconds (S2) @SC-1375', async () => {
    const rg = program('rg-slow', 'exec sleep 30')
    const t = Date.now()
    const r = await grep(root, { pattern: 'Staging' }, opts({ rgPath: rg }))
    expect(r).toMatchObject({ ok: false, reason: 'too-slow' })
    expect(Date.now() - t).toBeLessThan(4000)
  }, 10_000)
  it('stops reading an endless output at its cap and says the result is incomplete (S5) @SC-1375', async () => {
    const rg = program('rg-endless', `exec yes 'processes/release.md'`)
    const r = await grep(root, { pattern: 'x', output_mode: 'count' }, opts({ rgPath: rg }))
    expect(r).toMatchObject({ ok: true, incomplete: true })
  })
  it('refuses the 31st call in a minute from one caller (S2) @SC-1375', async () => {
    const rg = program('rg-none', 'exit 1')
    const limiter = new GrepRateLimiter()
    for (let i = 0; i < 30; i++) expect((await grep(root, { pattern: 'x' }, { rgPath: rg, limiter, callerKey: 'run-1' })).ok).toBe(true)
    expect(await grep(root, { pattern: 'x' }, { rgPath: rg, limiter, callerKey: 'run-1' })).toMatchObject({ ok: false, reason: 'rate-limited' })
    expect((await grep(root, { pattern: 'x' }, { rgPath: rg, limiter, callerKey: 'run-2' })).ok).toBe(true)
  })
  it('gives a fixed message for any other failure, and a missing ripgrep (S6, S8) @SC-1377', async () => {
    const noisy = program('rg-noisy', `echo "panic at /etc/secret/path: internal detail" >&2; exit 2`)
    for (const rgPath of [noisy, path.join(base, 'bin', 'missing-rg')]) {
      const r = await grep(root, { pattern: 'x' }, opts({ rgPath }))
      expect(r).toMatchObject({ ok: false, reason: 'search-failed' })
      expect(text(r)).not.toMatch(/etc|internal|missing-rg|ENOENT/)
    }
  })
  it('never gives the pattern to the logger, whatever the outcome (S7) @SC-1377', async () => {
    const pattern = 'person-wrote-this(?=x)'
    const logs: GrepLogEntry[] = []
    const logger = (e: GrepLogEntry) => logs.push(e)
    const echo = program('rg-echo', `echo "rg: regex parse error: $*" >&2; exit 2`)
    const slow = program('rg-slow2', 'exec sleep 30')
    const noisy = program('rg-noisy2', `echo "rg: $* (os error 5)" >&2; exit 2`)
    for (const rgPath of [echo, slow, noisy, '/nonexistent/rg']) await grep(root, { pattern, output_mode: 'content' }, opts({ rgPath, logger }))
    if (RG_ON_PATH) await grep(root, { pattern }, opts({ logger }))
    await grep(root, { pattern: pattern.repeat(30) }, opts({ logger }))
    expect(logs.length).toBeGreaterThanOrEqual(5)
    expect(JSON.stringify(logs)).not.toContain('person-wrote-this')
    expect(logs.every(l => l.tool === 'grep' && typeof l.ms === 'number')).toBe(true)
  }, 15_000)
  it('never throws, even when the logger does (S8) @SC-1377', async () => {
    const r = await grep(root, { pattern: 'x' }, opts({ rgPath: '/nonexistent/rg', logger: () => { throw new Error('log down') } }))
    expect(r).toMatchObject({ ok: false, reason: 'search-failed' })
  })
})
