import assert from 'node:assert/strict'
import { test } from 'node:test'
import { newestRelease, parseLsRemote, parseUses } from '../actions.mjs'

const c = x => x.repeat(40)

test('a pinned action is read with its repository, commit and version; a local workflow is not', () => {
  const text = [
    `      - uses: actions/checkout@${c('a')} # v7.0.1`,
    '    uses: ./.github/workflows/release-build.yml',
    `      - uses: github/codeql-action/init@${c('b')} # v4.1.0`,
    `        uses: docker/login-action@${c('c')} # v4.6.0`,
  ].join('\n')
  assert.deepEqual(parseUses(text), [
    { action: 'actions/checkout', repo: 'actions/checkout', commit: c('a'), version: 'v7.0.1' },
    { action: 'github/codeql-action/init', repo: 'github/codeql-action', commit: c('b'), version: 'v4.1.0' },
    { action: 'docker/login-action', repo: 'docker/login-action', commit: c('c'), version: 'v4.6.0' },
  ])
})

test("a tag's commit is the one it points to, the annotated tag's own object set aside", () => {
  const out = [`${c('1')}\trefs/tags/v7.0.1`, `${c('2')}\trefs/tags/v7.0.2`, `${c('3')}\trefs/tags/v7.0.2^{}`, `${c('4')}\trefs/tags/v7`].join('\n')
  assert.deepEqual(parseLsRemote(out), new Map([['v7.0.1', c('1')], ['v7.0.2', c('3')], ['v7', c('4')]]))
})

test('the newest release of the same major is chosen, with its commit; a floating major tag or a prerelease never', () => {
  const tags = new Map([['v7.0.1', c('1')], ['v7.1.0', c('2')], ['v7', c('9')], ['v8.0.0', c('8')], ['v7.2.0-beta.1', c('7')]])
  assert.deepEqual(newestRelease('v7.0.1', tags), { version: 'v7.1.0', commit: c('2') })
  assert.equal(newestRelease('v9.0.0', tags), null)
})
