import { test } from 'node:test'
import assert from 'node:assert/strict'
import { run, SIGNATURES_BRANCH, SIGNATURES_FILE } from '../check.mjs'

const CLA = 'Terms.\n\nThis agreement is version 1. A later version applies only…\n'
const SENTENCE = 'I have read the Contributor Licence Agreement, version 1, and I agree to it.'
const AVERY = { login: 'avery', id: 42, type: 'User' }

const notFound = () => Object.assign(new Error('Not Found'), { status: 404 })

/** Just enough of GitHub's REST client for the check: a repository with branches, files, comments and workflow runs. */
function fakeGitHub({ record = null, branch = record !== null, runs = [] } = {}) {
  const state = {
    branch,
    file: record === null ? null : { text: JSON.stringify(record), sha: 'sha-1' },
    comments: [],
    reruns: [],
    conflictsLeft: 0,
    nextId: 1,
  }
  const rest = {
    pulls: { get: async () => ({ data: pr() }) },
    repos: {
      getContent: async ({ ref, path }) => {
        assert.equal(ref, SIGNATURES_BRANCH)
        assert.equal(path, SIGNATURES_FILE)
        if (!state.file) throw notFound()
        return { data: { content: Buffer.from(state.file.text).toString('base64'), sha: state.file.sha } }
      },
      getBranch: async () => { if (!state.branch) throw notFound(); return { data: {} } },
      createOrUpdateFileContents: async ({ branch: b, path, sha, content }) => {
        assert.equal(b, SIGNATURES_BRANCH)
        assert.equal(path, SIGNATURES_FILE)
        if (state.conflictsLeft > 0) { state.conflictsLeft--; state.file = { ...state.file, sha: 'moved' }; throw Object.assign(new Error('conflict'), { status: 409 }) }
        assert.equal(sha, state.file?.sha)
        state.file = { text: Buffer.from(content, 'base64').toString(), sha: `sha-${state.nextId++}` }
        return { data: {} }
      },
    },
    git: {
      // The branch's first commit carries the file: what the tree holds is what was written.
      createTree: async ({ tree }) => { state.file = { text: tree[0].content, sha: 'sha-first' }; return { data: { sha: 'tree' } } },
      createCommit: async ({ parents }) => { assert.deepEqual(parents, []); return { data: { sha: 'commit' } } },
      createRef: async ({ ref }) => { assert.equal(ref, `refs/heads/${SIGNATURES_BRANCH}`); state.branch = true; return { data: {} } },
    },
    issues: {
      listComments: async () => ({ data: state.comments }),
      createComment: async ({ body }) => { state.comments.push({ id: state.nextId++, body, user: { type: 'Bot' } }); return { data: {} } },
      updateComment: async ({ comment_id, body }) => { state.comments.find((c) => c.id === comment_id).body = body; return { data: {} } },
    },
    actions: {
      listWorkflowRuns: async () => ({ data: { workflow_runs: runs } }),
      reRunWorkflow: async ({ run_id }) => { state.reruns.push(run_id); return { data: {} } },
    },
  }
  const github = { rest, paginate: async (method, params) => (await method(params)).data }
  return { github, state }
}

function pr(overrides = {}) {
  return { number: 7, user: AVERY, author_association: 'FIRST_TIME_CONTRIBUTOR', head: { sha: 'head' }, ...overrides }
}

function fakeCore() {
  const core = {
    failed: /** @type {string | null} */ (null),
    infos: /** @type {string[]} */ ([]),
    setFailed(m) { core.failed = m },
    info(m) { core.infos.push(m) },
  }
  return core
}

const context = (eventName, payload) => ({
  eventName,
  repo: { owner: 'example', repo: 'agenthix' },
  serverUrl: 'https://github.com',
  payload: { repository: { default_branch: 'main' }, ...payload },
})

const opened = (p = pr()) => context('pull_request_target', { pull_request: p })
const replied = (body, user = AVERY) => context('issue_comment', {
  issue: { number: 7, pull_request: {} },
  comment: { body, user, created_at: '2026-11-11T01:02:03Z', html_url: 'https://github.com/example/agenthix/pull/7#c1' },
})

test('a pull request from someone who has not agreed fails, with one comment saying exactly what to reply', async () => {
  const { github, state } = fakeGitHub()
  const core = fakeCore()
  await run({ github, context: opened(), core, claText: CLA })
  assert.match(core.failed, /avery has not agreed/)
  assert.equal(state.comments.length, 1)
  assert.match(state.comments[0].body, /@avery/)
  assert.ok(state.comments[0].body.includes(SENTENCE))
  assert.match(state.comments[0].body, /https:\/\/github\.com\/example\/agenthix\/blob\/main\/CLA\.md/)

  await run({ github, context: opened(), core: fakeCore(), claText: CLA })
  assert.equal(state.comments.length, 1, 'a new commit does not add a second comment')
})

test('bots and maintainers pass without being asked', async () => {
  for (const p of [pr({ user: { login: 'dependabot[bot]', id: 1, type: 'Bot' } }), pr({ author_association: 'OWNER' })]) {
    const { github, state } = fakeGitHub()
    const core = fakeCore()
    await run({ github, context: opened(p), core, claText: CLA })
    assert.equal(core.failed, null)
    assert.equal(state.comments.length, 0)
  }
})

test('someone who agreed to this version passes', async () => {
  const { github, state } = fakeGitHub({ record: { signatures: [{ login: 'avery', id: 42, version: 1 }] } })
  const core = fakeCore()
  await run({ github, context: opened(), core, claText: CLA })
  assert.equal(core.failed, null)
  assert.equal(state.comments.length, 0)
})

test('the author replying with the sentence is recorded on a new branch, thanked, and the failed check run again', async () => {
  const { github, state } = fakeGitHub({ runs: [{ id: 99, status: 'completed', conclusion: 'failure' }] })
  await run({ github, context: opened(), core: fakeCore(), claText: CLA })
  const core = fakeCore()
  await run({ github, context: replied(SENTENCE), core, claText: CLA })

  assert.equal(core.failed, null)
  assert.equal(state.branch, true)
  const record = JSON.parse(state.file.text)
  assert.deepEqual(record.signatures, [{
    login: 'avery', id: 42, version: 1, agreedAt: '2026-11-11T01:02:03Z', pullRequest: 7,
    comment: 'https://github.com/example/agenthix/pull/7#c1',
  }])
  assert.equal(state.comments.length, 1)
  assert.match(state.comments[0].body, /Thank you/)
  assert.deepEqual(state.reruns, [99])
})

test('a later agreement is added to the record, and a write that lost a race is tried again', async () => {
  const { github, state } = fakeGitHub({ record: { about: 'x', signatures: [{ login: 'jordan', id: 7, version: 1 }] } })
  state.conflictsLeft = 1
  await run({ github, context: replied(SENTENCE), core: fakeCore(), claText: CLA })
  assert.deepEqual(JSON.parse(state.file.text).signatures.map((s) => s.id), [7, 42])
})

test('the sentence from someone other than the author, or any other reply, records nothing', async () => {
  const { github, state } = fakeGitHub()
  await run({ github, context: replied(SENTENCE, { login: 'someone', id: 5, type: 'User' }), core: fakeCore(), claText: CLA })
  await run({ github, context: replied('Looks good to me'), core: fakeCore(), claText: CLA })
  assert.equal(state.file, null)
  assert.equal(state.comments.length, 0)
})
