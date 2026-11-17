import { test } from 'node:test'
import assert from 'node:assert/strict'
import { breakingFooter, isMarkedBreaking, parseLog } from '../breaks/commits.mjs'
import { FORMATS, formatBreaks, formatNumber, protocolBreaks, surfaceBreaks } from '../breaks/found.mjs'
import { breakRefusal, judge, notesSection, previousTag } from '../breaks/verdict.mjs'

const commit = (sha, message) => ({ sha, subject: message.split('\n')[0], message })

test('a commit is marked breaking by a ! or by its footer', () => {
  assert.equal(isMarkedBreaking('feat(host)!: install asks for the address'), true)
  assert.equal(isMarkedBreaking('feat!: no area'), true)
  assert.equal(isMarkedBreaking('fix(site): a run says so\n\nBREAKING CHANGE: reinstall the site.'), true)
  assert.equal(isMarkedBreaking('fix(site): a run says so\n\nBREAKING-CHANGE: reinstall the site.'), true)
  assert.equal(isMarkedBreaking('feat(host): the word breaking! in a subject'), false)
  assert.equal(isMarkedBreaking('docs: mention BREAKING CHANGE: in prose'), false)
})

test("the footer's words run to the next footer, on one line", () => {
  const message = 'feat(host)!: x\n\nBody.\n\nBREAKING CHANGE: run agenthix upgrades\nonce before upgrading.\nRefs: #12'
  assert.equal(breakingFooter(message), 'run agenthix upgrades once before upgrading.')
  assert.equal(breakingFooter('feat(host)!: x'), null)
})

test("git log's records are read back", () => {
  const log = 'aaa\x1ffeat(a): one\n\nbody\n\x1e\nbbb\x1ffix(b): two\n\x1e\n'
  assert.deepEqual(parseLog(log).map((c) => [c.sha, c.subject]), [['aaa', 'feat(a): one'], ['bbb', 'fix(b): two']])
})

test('the previous release is the newest tag below the version', () => {
  const tags = ['v0.1.0-alpha.5', 'v0.1.0-alpha.6', 'v0.1.0-alpha.10', 'v0.1.0', 'v0.2.0', 'other']
  assert.equal(previousTag(tags, '0.1.0'), 'v0.1.0-alpha.10')
  assert.equal(previousTag(tags, '0.1.1'), 'v0.1.0')
  assert.equal(previousTag(tags, '0.2.0-rc.1'), 'v0.1.0')
  assert.equal(previousTag(['v0.1.0'], '0.1.0'), null)
})

test('a break is refused for a patch, a release after its own pre-releases and, from 1.0.0, a minor', () => {
  assert.match(breakRefusal('0.1.1', 'v0.1.0'), /a break is released as 0\.2\.0/)
  assert.match(breakRefusal('0.1.0', 'v0.1.0-alpha.6'), /same line/)
  assert.match(breakRefusal('0.1.0-rc.1', 'v0.1.0-alpha.6'), /same line/)
  assert.match(breakRefusal('1.1.0', 'v1.0.3'), /a break is released as 2\.0\.0/)
  assert.equal(breakRefusal('0.1.0-alpha.7', 'v0.1.0-alpha.6'), null)
  assert.equal(breakRefusal('0.2.0', 'v0.1.4'), null)
  assert.equal(breakRefusal('2.0.0', 'v1.4.0'), null)
  assert.equal(breakRefusal('0.1.0', null), null)
})

const snapshot = (connection, version) => JSON.stringify({ connection, version, types: {} })

test("a protocol's major moving is a break; its minor is not", () => {
  const before = (f) => (f === 'core/snapshot/host.json' ? snapshot('host', '1.2') : f === 'core/snapshot/site.json' ? snapshot('site', '1.0') : null)
  const now = (f) => (f === 'core/snapshot/host.json' ? snapshot('host', '2.0') : f === 'core/snapshot/site.json' ? snapshot('site', '1.3') : null)
  assert.deepEqual(protocolBreaks(before, now).map((b) => b.what), ["the host protocol's major moved, 1.2 to 2.0"])
})

test("a stored format's number moving is a break", () => {
  const file = 'core/src/protocol/packages.ts'
  const before = (f) => (f === file ? 'export const PACKAGE_FORMAT_VERSION = 1\n' : null)
  const now = (f) => (f === file ? 'export const PACKAGE_FORMAT_VERSION = 2\n' : null)
  assert.deepEqual(formatBreaks(before, now).map((b) => [b.what, b.files]), [[
    "the format of an agent package's contents (PACKAGE_FORMAT_VERSION) moved, 1 to 2", [file]]])
})

test("every stored format's number is read from this tree", async () => {
  const { readFileSync } = await import('node:fs')
  const root = new URL('../../../', import.meta.url)
  for (const format of FORMATS) assert.notEqual(formatNumber(format, readFileSync(new URL(format.file, root), 'utf8')), null, format.file)
})

test('an entry gone from a surface snapshot is a break; one added is not', () => {
  const file = 'host/snapshot/cli.json'
  const before = (f) => (f === file ? JSON.stringify({ entries: ['backup', 'backup export', 'status'] }) : null)
  const now = (f) => (f === file ? JSON.stringify({ entries: ['backup', 'status', 'uninstall'] }) : null)
  assert.deepEqual(surfaceBreaks(before, now).map((b) => b.what), ['the agenthix command or option `backup export` was removed'])
  assert.deepEqual(surfaceBreaks(() => null, now), [], 'nothing to compare with at a tag that had no snapshot')
})

const found = (what, shas) => ({ what, files: ['core/snapshot/host.json'], shas })

test('with no break the notes have no section', () => {
  const { problems, lines } = judge({ version: '0.1.1', previous: 'v0.1.0', commits: [commit('a1', 'fix(site): x')], detected: [] })
  assert.deepEqual(problems, [])
  assert.equal(notesSection(lines), '')
})

test('a found break needs a marked commit among those that changed its files', () => {
  const commits = [commit('a1', 'feat(core): host protocol 2.0'), commit('b2', 'fix(site): y')]
  const { problems } = judge({ version: '0.2.0', previous: 'v0.1.0', commits, detected: [found('the host major moved', ['a1'])] })
  assert.equal(problems.length, 1)
  assert.match(problems[0], /the host major moved, and no commit since v0\.1\.0 that changed core\/snapshot\/host\.json is marked breaking/)
})

test("a marked break opens the notes with its footer's words, and the breaks it explains", () => {
  const commits = [commit('a1b2c3d4e5', 'feat(core)!: host protocol 2.0\n\nBREAKING CHANGE: upgrade every host service before hq.'), commit('f6', 'fix(site): y')]
  const { problems, lines } = judge({ version: '0.2.0', previous: 'v0.1.4', commits, detected: [found('the host major moved', ['a1b2c3d4e5'])] })
  assert.deepEqual(problems, [])
  assert.equal(notesSection(lines), '## Breaking changes, and what to do\n\n- upgrade every host service before hq. (a1b2c3d4; the host major moved)\n')
})

test('a marked commit with no footer is refused', () => {
  const { problems } = judge({ version: '0.2.0', previous: 'v0.1.0', commits: [commit('a1', 'feat(host)!: x')], detected: [] })
  assert.match(problems[0], /no `BREAKING CHANGE: <what an installation must do>` footer/)
})

test('a patch with a break is refused, naming each', () => {
  const commits = [commit('a1', 'feat(host)!: x\n\nBREAKING CHANGE: do y.')]
  const { problems } = judge({ version: '0.1.1', previous: 'v0.1.0', commits, detected: [found('the host major moved', ['a1'])] })
  assert.match(problems[0], /0\.1\.1 is on the same line as 0\.1\.0/)
  assert.ok(problems.some((p) => p.includes('marked breaking: a1')))
  assert.ok(problems.some((p) => p.includes('found: the host major moved')))
})
