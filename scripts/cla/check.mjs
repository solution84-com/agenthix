// The CLA check (.github/workflows/cla.yml), run by actions/github-script with its `github`, `context` and `core`.
// On a pull request it passes when the author has agreed to this version of CLA.md, or is a bot or a maintainer;
// otherwise it comments once with the sentence to reply with, and fails. When the author replies with that sentence,
// it records the agreement on the cla-signatures branch, thanks them, and runs the failed check again. It reads the
// pull request only through the API: no code from a pull request is checked out or run.
import { agreementSentence, claVersion, exemption, hasAgreed, isAgreement, withSignature } from './agreement.mjs'

export const SIGNATURES_BRANCH = 'cla-signatures'
export const SIGNATURES_FILE = 'signatures.json'
const WORKFLOW_FILE = 'cla.yml'
const MARKER = '<!-- cla-check -->'
const EMPTY = {
  about: 'Who has agreed to the Contributor Licence Agreement (CLA.md), and to which version. Written by the CLA check '
    + '(.github/workflows/cla.yml); a maintainer adds the people an organisation has agreed for.',
  signatures: [],
}

export async function run({ github, context, core, claText }) {
  const { owner, repo } = context.repo
  const where = { github, owner, repo }
  const version = claVersion(claText)
  const onComment = context.eventName === 'issue_comment'
  const pr = onComment
    ? (await github.rest.pulls.get({ owner, repo, pull_number: context.payload.issue.number })).data
    : context.payload.pull_request
  const author = pr.user

  const exempt = exemption({ type: author.type, association: pr.author_association })
  if (exempt) {
    core.info(`${author.login} is ${exempt}, so is not asked to agree.`)
    return
  }

  if (onComment) {
    const comment = context.payload.comment
    if (comment.user.id !== author.id || !isAgreement(comment.body, version)) {
      core.info('Not an agreement by the pull request\'s author: nothing to record.')
      return
    }
    await record(where, {
      login: author.login, id: author.id, version, agreedAt: comment.created_at, pullRequest: pr.number, comment: comment.html_url,
    })
    await say(where, pr.number, `${MARKER}\nThank you, @${author.login}: your agreement to the Contributor Licence Agreement, `
      + `version ${version}, is recorded. The check passes on this pull request and on your later ones.`)
    await runCheckAgain(where, pr.head.sha)
    return
  }

  if (hasAgreed((await read(where)).record, author.id, version)) {
    core.info(`${author.login} has agreed to version ${version}.`)
    return
  }
  const claUrl = `${context.serverUrl}/${owner}/${repo}/blob/${context.payload.repository.default_branch}/CLA.md`
  await say(where, pr.number, ask(author.login, version, claUrl))
  core.setFailed(`${author.login} has not agreed to the Contributor Licence Agreement, version ${version}. `
    + 'The comment on the pull request says how.')
}

function ask(login, version, claUrl) {
  return [
    MARKER,
    `Thank you for your pull request, @${login}. Before it can be merged, we ask every contributor to agree to the `
      + `[Contributor Licence Agreement](${claUrl}), once. It lets Solution84 use your contribution in Agenthix Cloud and `
      + 'in paid features; you keep the copyright in what you wrote.',
    '',
    'To agree, reply to this pull request with this sentence, on its own:',
    '',
    `> ${agreementSentence(version)}`,
    '',
    'If you contribute as part of your work, check with your employer first: an organisation can agree for its people, '
      + 'as the agreement\'s "For organisations" says.',
  ].join('\n')
}

async function read({ github, owner, repo }) {
  try {
    const { data } = await github.rest.repos.getContent({ owner, repo, path: SIGNATURES_FILE, ref: SIGNATURES_BRANCH })
    return { record: JSON.parse(Buffer.from(data.content, 'base64').toString('utf8')), sha: data.sha }
  } catch (err) {
    if (err.status === 404) return { record: EMPTY, sha: null }
    throw err
  }
}

const isConflict = (err) => err.status === 409 || err.status === 422

/** Read, add, write; a write that another one beat is tried again on what that one wrote. */
async function record(where, signature) {
  const { github, owner, repo } = where
  for (let attempt = 0; attempt < 3; attempt++) {
    const { record: before, sha } = await read(where)
    const after = withSignature(before, signature)
    if (after === before) return
    const text = `${JSON.stringify(after, null, 2)}\n`
    const message = `Record ${signature.login}'s agreement to the CLA, version ${signature.version}`
    try {
      if (sha === null && !(await branchExists(where))) {
        // The branch holds only the record, so it starts with no history of its own.
        const tree = await github.rest.git.createTree({ owner, repo, tree: [{ path: SIGNATURES_FILE, mode: '100644', type: 'blob', content: text }] })
        const commit = await github.rest.git.createCommit({ owner, repo, message, tree: tree.data.sha, parents: [] })
        await github.rest.git.createRef({ owner, repo, ref: `refs/heads/${SIGNATURES_BRANCH}`, sha: commit.data.sha })
      } else {
        await github.rest.repos.createOrUpdateFileContents({
          owner, repo, path: SIGNATURES_FILE, branch: SIGNATURES_BRANCH, message,
          content: Buffer.from(text).toString('base64'), ...(sha && { sha }),
        })
      }
      return
    } catch (err) {
      if (!isConflict(err)) throw err
    }
  }
  throw new Error('The agreement could not be recorded: the record kept changing while it was written.')
}

async function branchExists({ github, owner, repo }) {
  try {
    await github.rest.repos.getBranch({ owner, repo, branch: SIGNATURES_BRANCH })
    return true
  } catch (err) {
    if (err.status === 404) return false
    throw err
  }
}

/** One comment per pull request, changed in place, so new commits do not add more. */
async function say({ github, owner, repo }, number, body) {
  const comments = await github.paginate(github.rest.issues.listComments, { owner, repo, issue_number: number, per_page: 100 })
  const mine = comments.find((c) => c.user?.type === 'Bot' && c.body?.includes(MARKER))
  if (mine) await github.rest.issues.updateComment({ owner, repo, comment_id: mine.id, body })
  else await github.rest.issues.createComment({ owner, repo, issue_number: number, body })
}

/** The check on the pull request is that workflow's run for its head commit; once the author agrees it passes. */
async function runCheckAgain({ github, owner, repo }, headSha) {
  const { data } = await github.rest.actions.listWorkflowRuns({
    owner, repo, workflow_id: WORKFLOW_FILE, event: 'pull_request_target', head_sha: headSha, per_page: 1,
  })
  const latest = data.workflow_runs[0]
  if (latest && latest.status === 'completed' && latest.conclusion !== 'success') {
    await github.rest.actions.reRunWorkflow({ owner, repo, run_id: latest.id })
  }
}
