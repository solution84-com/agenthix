import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { isGitBranchName } from '../gitNames.js'

/**
 * The commit helper runs as program text inside a container and cannot import core, so it keeps a copy of the branch
 * name rule (`site/src/server/branches/program/core.ts`). This runs that copy and core's over one list of names.
 */
const text = readFileSync(new URL('../../../../site/src/server/branches/program/core.ts', import.meta.url), 'utf8')
const start = text.indexOf('function isBranch(name) {')
const body = text.slice(start, text.indexOf('\n}\n', start) + 2)
const helperIsBranch = new Function(`${body}\nreturn isBranch`)() as (name: unknown) => boolean

const NAMES: unknown[] = [
  'main', 'backup/login-page-2026-11-01', 'feature/Login_Form', 'release/1.0.1', 'a.b', 'add-login-page',
  '', '-x', '--upload-pack=x', 'HEAD', '@', 'a..b', 'a@{1}', 'a//b', '/a', 'a/', 'a.', '.a', 'a/.b', 'a.lock',
  'a/b.lock/c', 'a b', 'a~1', 'a^', 'a:b', 'a?', 'a*', 'a[b', 'a\\b', 'a\x7f', 'a\nb', 'é', 'x'.repeat(200), 'x'.repeat(201),
  undefined, null, 5, ['main'],
]

describe("the commit helper's branch-name rule", () => {
  it('finds the helper function', () => {
    expect(start).toBeGreaterThan(0)
  })

  it("is the same rule as core's, name by name", () => {
    for (const name of NAMES) expect(helperIsBranch(name), JSON.stringify(name)).toBe(isGitBranchName(name))
  })
})
