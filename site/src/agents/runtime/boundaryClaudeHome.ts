/**
 * The Claude side of a run's harness home (harnessHomes.ts): the `.claude/`
 * folder inside it, where the run's own credential is written and its skills
 * are staged, and the home's bind into the container.
 *
 * An agent holds no credential of its own (spec §6.3) and nothing agent-scoped
 * is mounted into a container (spec §6.1). The home is keyed exactly as the
 * container is — boundary × runner (ADR-0074) — so the credential hq decided
 * for a run lands only in the home of the person (or project) it runs for, and
 * one member's Claude state is never in another member's container.
 *
 * The whole harness home is bound at the image user's home directory, not only
 * `.claude/`: Claude Code keeps `~/.claude.json` at the home root, and a later
 * runtime keeps its state beside `.claude/`. The image therefore keeps nothing
 * under that directory (agent.Dockerfile); `prepareHarnessHome` seeds what
 * Claude Code expects to find.
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import type { RunCredential } from '@agenthix/core'
import { AGENT_CONTAINER_CLAUDE_HOME } from '../agentDiskPaths'
import {
  credentialHomeRunCount,
  parseCredentialExpiresAt,
  readCredentialExpiresAt,
  serialiseCredentialHome,
  takeUnreportedCredentialHold,
} from './agentCredentials'
import { SKILLS_STAGING_DIRNAME } from './skillsStagingDir'
import { writeFileAtomic } from './credentialFile'
import { freshestDocumentFor, homeHoldsAnotherLogin, noteHomeLogin } from './subscriptionLogins'
import { HARNESS_HOME_CONTAINER_DIR, harnessHomeFor } from './harnessHomes'
import type { ContainerKey } from './containerTypes'

const CLAUDE_DIRNAME = '.claude'

/**
 * The run's Claude folder AS THE SITE SERVER PROCESS SEES IT — where the
 * credential is written and the run's skills are staged. Rooted at SITE_ROOT,
 * the only path this directory has: spec §6.10 mounts the data folder at the
 * same path inside and outside the container, so the server's own view of it
 * is also the bind source.
 */
export function runnerClaudeHome(key: ContainerKey): string {
  return path.join(harnessHomeFor(key), CLAUDE_DIRNAME)
}

/**
 * The whole harness home as a docker bind. Built once and used both in the
 * mount signature and in `docker run`'s argv, so the thing compared and the
 * thing bound cannot be different strings.
 */
export function harnessHomeBind(key: ContainerKey): string {
  return `${harnessHomeFor(key)}:${HARNESS_HOME_CONTAINER_DIR}`
}

/**
 * Creates the home and what Claude Code expects in it, before `docker run`:
 * Docker makes a missing bind source root-owned, and the run (appuser) then
 * cannot write into its own home. `~/.claude.json` is seeded empty only when
 * absent — Claude Code warns on every run without it, and once written it is
 * the runner's own state, kept across containers like the rest of the home.
 */
export async function prepareHarnessHome(key: ContainerKey): Promise<void> {
  const home = harnessHomeFor(key)
  await fs.mkdir(path.join(home, CLAUDE_DIRNAME), { recursive: true })
  await fs.writeFile(path.join(home, '.claude.json'), '{}', { flag: 'wx', mode: 0o600 }).catch((err: NodeJS.ErrnoException) => {
    if (err.code !== 'EEXIST') throw err
  })
}

/** The folder the run's skills are staged into, as the site server sees it. */
export function runnerSkillsStagingDir(key: ContainerKey): string {
  return path.join(runnerClaudeHome(key), SKILLS_STAGING_DIRNAME)
}

/**
 * That folder as a docker bind: read-only, laid
 * over the read-write home bind so the container cannot rewrite what the site
 * staged for it while the site, writing on the host, still can. File modes
 * could not do this — the container's user is the site's own uid and can set
 * them back. The source must exist before `docker run` (see `_start`) or docker
 * creates it root-owned.
 */
export function runnerSkillsStagingBind(key: ContainerKey): string {
  return `${runnerSkillsStagingDir(key)}:${path.posix.join(AGENT_CONTAINER_CLAUDE_HOME, SKILLS_STAGING_DIRNAME)}:ro`
}

/**
 * The Claude folder AS A RUN SEES IT: the fixed container path under isolation,
 * the server-visible directory otherwise. Anything the run is handed a path to
 * — the skills staged for it, for one — must be named this way, never by the
 * raw server directory: a container must reveal nothing of the site's own
 * layout.
 */
export function resolveVisibleClaudeHome(key: ContainerKey): string {
  return process.env.AGENT_CONTAINER_ISOLATION === 'true'
    ? AGENT_CONTAINER_CLAUDE_HOME
    : runnerClaudeHome(key)
}

/**
 * The end-of-run removal of whatever credentials document a home holds, except
 * a refreshed token hq never received (see `holdUnreportedCredential`). Absent is success —
 * there was nothing to take away. Any other failure throws: a document that
 * could not be removed is a credential still sitting where Claude Code
 * authenticates from, which is the thing callers are relying on being gone.
 */
export async function clearRunCredential(home: string): Promise<void> {
  // A refreshed token that could not be sent to hq exists only in this file.
  // Spared once — the next run in this home either uses it or, granted another
  // credential, removes it on arrival (`writeRunCredential`) — and its own end
  // takes it away unless it too failed to report.
  if (takeUnreportedCredentialHold(home)) return
  await removeCredentialFile(home)
}

async function removeCredentialFile(home: string): Promise<void> {
  await fs.rm(path.join(home, '.credentials.json'), { force: true })
  noteHomeLogin(home, undefined)
}

/**
 * Puts the one credential this run may use into the runner's Claude home, before
 * the container is started or reused — and takes away whatever was there when
 * this run was granted none.
 *
 * WRITE OR CLEAR, never write or leave. Only a subscription login writes
 * anything: it IS the Claude Code OAuth document, and the SDK reads it from
 * this directory. An API key reaches the run as an environment variable and
 * needs no file; a run with no credential at all has already failed in
 * `runLaunch` if it was going to use one. But this home outlives the run that
 * filled it and is bound read-write into every later run for the same runner there,
 * so "writes nothing" would mean "inherits whatever the last run left". The
 * case that makes it a defect rather than untidiness: a person deletes their
 * subscription, hq stops handing it out, and their OAuth document is still on
 * this disk at exactly the path the next run authenticates from — hq revoked
 * and the disk did not. A credential must not outlive the authority that put
 * it there, so a non-subscription run removes it.
 *
 * Runs that share a home now run in parallel (ADR-0075): a home belongs to one
 * runner in one boundary, and one person's conversations there run at once.
 * So the removal is skipped while another run is still using the home, and
 * the write and the removal go one at a time per home — see the note in the
 * body, which lane 2's merge completes.
 *
 * The directory itself is created either way, and before `docker run`: if
 * Docker has to create a missing `-v` source it makes it root-owned, and the
 * run (appuser) then cannot write into its own Claude home. That failure is
 * not swallowed — a home this process could not create is one the run cannot
 * use, and hiding it here is how it resurfaces as an unexplained permission
 * error inside somebody's container.
 *
 * FRESHEST WINS, the same rule the shared seed used to apply in the other
 * direction: Claude Code refreshes an OAuth token in place during a long run,
 * so the copy already in this home can be NEWER than the one hq dispatched.
 * Writing unconditionally would throw that refresh away before
 * the run's grant reported it back to hq (subscriptionLogins.ts) — the only
 * holder of a person's subscription — and hq's copy would stay stale until it
 * expired. A home with no document yet is written unconditionally, including
 * when the supplied document carries no parseable `expiresAt`, so a first run
 * is never left with nothing to authenticate with.
 */
export async function writeRunCredential(home: string, credential: RunCredential | null): Promise<void> {
  // One file operation at a time per home: an end-of-run removal already in
  // flight must not land after this run's write (agentCredentials.ts).
  return serialiseCredentialHome(home, async () => {
    await fs.mkdir(home, { recursive: true })
    if (credential?.kind !== 'subscription') {
      // Spared only while another run still uses the home — the arriving run
      // counts itself. That run belongs to the same runner in the same
      // boundary, so the document is already readable here; taking it away
      // would fail the run using it. Otherwise a run granted no subscription
      // must not find one, whatever an earlier run failed to report, and its
      // hold, if any, goes with the file.
      if (credentialHomeRunCount(home) > 1) return
      takeUnreportedCredentialHold(home)
      await removeCredentialFile(home)
      return
    }

    // The freshest copy of this login on the site, which hq may not have yet
    // (subscriptionLogins.ts). Freshest-wins applies only within one login: a
    // home holding another sign-in's document is overwritten however fresh
    // that document is, or the run would use a login it was not given.
    const document = freshestDocumentFor(credential)
    const dest = path.join(home, '.credentials.json')
    const onDisk = await readCredentialExpiresAt(dest)
    const keep = onDisk !== null
      && !homeHoldsAnotherLogin(home, credential.loginId)
      && parseCredentialExpiresAt(document) <= onDisk
    if (!keep) await writeFileAtomic(dest, document)
    noteHomeLogin(home, credential.loginId)
  })
}
