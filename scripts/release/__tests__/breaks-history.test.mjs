// findBreaks against a real Git history in a temporary folder.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { findBreaks } from '../breaks.mjs'

function repo(t) {
  const dir = mkdtempSync(join(tmpdir(), 'breaks-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const git = (args) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  git(['init', '--quiet', '--initial-branch=main'])
  git(['config', 'user.name', 'Test'])
  git(['config', 'user.email', 'test@example.com'])
  git(['config', 'commit.gpgsign', 'false'])
  const write = (path, text) => { mkdirSync(dirname(join(dir, path)), { recursive: true }); writeFileSync(join(dir, path), text) }
  const commitAll = (message) => { git(['add', '-A']); git(['commit', '--quiet', '-m', message]) }
  const readNow = (path) => (existsSync(join(dir, path)) ? readFileSync(join(dir, path), 'utf8') : null)
  write('hq/migrations/1_init/migration.sql', 'CREATE TABLE "Run" ("id" TEXT, "legacy" TEXT);')
  write('host/snapshot/cli.json', JSON.stringify({ entries: ['backup', 'backup export'] }))
  commitAll('feat(hq): the first release')
  git(['tag', 'v0.1.0'])
  return { git, write, commitAll, readNow }
}

test('nothing broken since the tag: no problem and no section @SC-2189 @SC-2191', (t) => {
  const r = repo(t)
  r.write('hq/migrations/2_more/migration.sql', 'ALTER TABLE "Run" ADD COLUMN "note" TEXT;')
  r.commitAll('feat(hq): runs take a note')
  assert.deepEqual(findBreaks({ version: '0.1.1', git: r.git, readNow: r.readNow }), { previous: 'v0.1.0', problems: [], lines: [] })
})

test('an unmarked dropped column is refused; marked, a minor carries it into the notes @SC-2189 @SC-2190 @SC-2191', (t) => {
  const r = repo(t)
  r.write('hq/migrations/2_drop/migration.sql', 'ALTER TABLE "Run" DROP COLUMN "legacy";')
  r.commitAll('feat(hq): runs lose their legacy field')
  const unmarked = findBreaks({ version: '0.2.0', git: r.git, readNow: r.readNow })
  assert.equal(unmarked.problems.length, 1)
  assert.match(unmarked.problems[0], /2_drop\/migration\.sql drops the column "Run"\."legacy", and no commit since v0\.1\.0/)

  r.git(['commit', '--quiet', '--amend', '-m', 'feat(hq)!: runs lose their legacy field\n\nBREAKING CHANGE: export the legacy field before upgrading.'])
  const marked = findBreaks({ version: '0.2.0', git: r.git, readNow: r.readNow })
  assert.deepEqual(marked.problems, [])
  assert.equal(marked.lines.length, 1)
  assert.match(marked.lines[0], /^- export the legacy field before upgrading\. \([0-9a-f]{8}; hq\/migrations\/2_drop/)
  assert.match(findBreaks({ version: '0.1.1', git: r.git, readNow: r.readNow }).problems[0], /a break is released as 0\.2\.0/)
})

test('a removed command found in the snapshot is explained by the commit that changed the snapshot @SC-2189 @SC-2191', (t) => {
  const r = repo(t)
  r.write('host/snapshot/cli.json', JSON.stringify({ entries: ['backup'] }))
  r.commitAll('feat(host)!: backup export goes\n\nBREAKING CHANGE: copy the backups folder instead.')
  const { problems, lines } = findBreaks({ version: '0.2.0', git: r.git, readNow: r.readNow })
  assert.deepEqual(problems, [])
  assert.match(lines[0], /copy the backups folder instead\. \([0-9a-f]{8}; the agenthix command or option `backup export` was removed\)/)
})

test('with no earlier release there is nothing to break @SC-2189', (t) => {
  const r = repo(t)
  assert.deepEqual(findBreaks({ version: '0.1.0', git: r.git, readNow: r.readNow }), { previous: null, problems: [], lines: [] })
})
