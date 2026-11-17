#!/usr/bin/env node
// Finds the release build (release-build.yml) that proved a commit, and fetches an artifact of that run:
//   node scripts/release/proven-run.mjs --commit <sha> --artifact <name> --dir <folder> [--wait-minutes <n>]
// The run is the latest one for the commit started by hand from main or a release branch, in this repository: a run of
// release-build.yml itself, or a run of Release (release.yml), which calls it, so that run's artifacts are Release's.
// A push proves nothing: pushing a release branch only saves its progress and runs Checks. A run by hand builds the
// commit it was given, which only its candidate record names, so each run's record is read to learn its commit. The
// release build must have passed: one that failed refuses, and one still running is waited for. A Release run goes on
// to tag and publish after its build, so its verdict is its job "The release bar passed", not the run's; and one that
// has not yet built is not waited for, since it may be queued behind the Release run that is publishing. Prints the
// run's ID. Needs gh, with GH_TOKEN, and GITHUB_REPOSITORY (owner/name).
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const WORKFLOW = 'release-build.yml'
export const RELEASE_WORKFLOW = 'release.yml'
// The release build's last job, which passes only when every part of the bar ran and passed; in a Release run it is
// named after the calling job, "<caller> / The release bar passed".
const BAR_JOB = 'The release bar passed'

/** Whether a run may prove a release: its event and the branch it ran on, which the attestation identity also names. */
export function isTrusted(run, repository) {
  if (run.head_repository?.full_name !== repository) return false
  const branch = run.head_branch ?? ''
  return run.event === 'workflow_dispatch' && (branch === 'main' || branch.startsWith('release/'))
}

/** Whether a run is one of Release's (release.yml), as `main` marks the runs it lists. */
export const isRelease = run => run.workflow === RELEASE_WORKFLOW

/**
 * The verdict on a commit's release build, from the runs of release-build.yml and of Release (as GitHub lists them,
 * Release's marked `workflow: 'release.yml'`), `commitOf(run)`, the commit a run's candidate record names, or null when
 * it has none (yet), and `barOf(run)`, a Release run's job "The release bar passed" ({ status, conclusion }), or null
 * when it has none yet. Newest first; the first run for the commit decides. A run of release-build.yml by hand still
 * running with no record yet may be for this commit, so it is waited for; a Release run with none is passed over.
 * Returns { state: 'pass' | 'fail' | 'wait' | 'none', run?, reason }.
 */
export function chooseRun({ runs, commit, repository, commitOf, barOf = () => null }) {
  const trusted = runs.filter(r => isTrusted(r, repository))
    .sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? '') || b.id - a.id)
  for (const run of trusted) {
    const built = commitOf(run)
    if (built === commit) {
      // A Release run's own conclusion waits on its tag and publish; its release build's is the bar job's.
      const bar = isRelease(run) ? (barOf(run) ?? (run.status === 'completed' ? { status: 'completed', conclusion: run.conclusion } : { status: run.status })) : run
      if (bar.status !== 'completed') return { state: 'wait', run, reason: `The release build for ${commit} (run ${run.id}) is ${bar.status}.` }
      if (bar.conclusion === 'success') return { state: 'pass', run, reason: `The release build for ${commit} passed (run ${run.id}).` }
      return { state: 'fail', run, reason: `The latest release build for ${commit} (run ${run.id}) ended ${bar.conclusion}, not passed.` }
    }
    if (built == null && run.status !== 'completed' && !isRelease(run)) {
      return { state: 'wait', run, reason: `A release build started by hand (run ${run.id}) is ${run.status} and has not yet said which commit it builds.` }
    }
  }
  return { state: 'none', reason: `No release build ran for ${commit} on main or a release branch.` }
}

const gh = args => execFileSync('gh', args, { encoding: 'utf8', maxBuffer: 1 << 26 })

/** Downloads one artifact of a run into `dir`; false when the run has none of that name. */
export function downloadArtifact({ repository, runId, name, dir }) {
  const ids = gh(['api', `repos/${repository}/actions/runs/${runId}/artifacts?per_page=100`, '--jq', `.artifacts[] | select(.name == "${name}" and (.expired | not)) | .id`])
    .split('\n').filter(Boolean)
  if (ids.length === 0) return false
  const zip = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'artifact-')), 'a.zip')
  fs.writeFileSync(zip, execFileSync('gh', ['api', `repos/${repository}/actions/artifacts/${ids[0]}/zip`], { maxBuffer: 1 << 30 }))
  fs.mkdirSync(dir, { recursive: true })
  execFileSync('unzip', ['-o', '-q', zip, '-d', dir])
  return true
}

function main() {
  const arg = name => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : undefined }
  const need = name => arg(name) ?? (() => { throw new Error(`--${name} is required.`) })()
  const commit = need('commit'), artifact = need('artifact'), dir = need('dir')
  const repository = process.env.GITHUB_REPOSITORY ?? (() => { throw new Error('GITHUB_REPOSITORY is not set.') })()
  const deadline = Date.now() + Number(arg('wait-minutes') ?? 60) * 60_000
  const seen = new Map()
  const commitOf = run => {
    if (!seen.has(run.id)) {
      const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'candidate-'))
      const found = downloadArtifact({ repository, runId: run.id, name: 'candidate', dir: scratch })
      const commitIn = found ? JSON.parse(fs.readFileSync(path.join(scratch, 'candidate.json'), 'utf8')).commit : null
      // A record is final once written; a run with none is asked again only while it runs.
      if (found || run.status === 'completed') seen.set(run.id, commitIn)
      else return null
    }
    return seen.get(run.id)
  }
  const barOf = run => {
    const jobs = JSON.parse(gh(['api', '--paginate', '--slurp', `repos/${repository}/actions/runs/${run.id}/jobs?filter=latest&per_page=100`]))
      .flatMap(page => page.jobs)
    const bar = jobs.find(j => j.name === BAR_JOB || j.name.endsWith(` / ${BAR_JOB}`))
    return bar ? { status: bar.status, conclusion: bar.conclusion } : null
  }
  const since = new Date(Date.now() - 90 * 86_400_000).toISOString().slice(0, 10)
  const runsOf = workflow => JSON.parse(gh(['api', '--paginate', '--slurp', `repos/${repository}/actions/workflows/${workflow}/runs?per_page=100&created=%3E${since}`]))
    .flatMap(page => page.workflow_runs).map(run => ({ ...run, workflow }))
  for (;;) {
    const runs = [...runsOf(WORKFLOW), ...runsOf(RELEASE_WORKFLOW)]
    const verdict = chooseRun({ runs, commit, repository, commitOf, barOf })
    console.error(verdict.reason)
    if (verdict.state === 'pass') {
      if (!downloadArtifact({ repository, runId: verdict.run.id, name: artifact, dir })) {
        console.error(`::error::The release build for ${commit} (run ${verdict.run.id}) passed but holds no artifact '${artifact}'. Start the release build again for this commit, then run this again. Nothing was changed.`)
        process.exit(1)
      }
      console.log(verdict.run.id)
      return
    }
    if (verdict.state === 'fail' || verdict.state === 'none') {
      console.error(`::error::${verdict.reason} A tag publishes only a commit the release build proved: start Release (or the release build) for ${commit} from main or its release branch, let it pass, then run this again. Nothing was changed.`)
      process.exit(1)
    }
    if (Date.now() > deadline) {
      console.error(`::error::${verdict.reason} It did not finish in time; run this again once it has. Nothing was changed.`)
      process.exit(1)
    }
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 30_000)
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
