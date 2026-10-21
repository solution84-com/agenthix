/**
 * The upgrade comparison (adr-0085): Agenthix's own `read`, `write`, `edit`,
 * `apply_patch` and `skill` beside OpenCode's built-ins of the same names, on
 * the same fixture projects (toolComparison.cases.ts), in a real OpenCode
 * server in the agent image. It reports every difference in what the model
 * is shown — each call's status, output, error text and attachments — and in
 * the files each run leaves behind.
 *
 * Both sides run in one container, one after the other, with a stand-in model
 * that makes each case's calls with scripted arguments (no real model, no
 * network). "Ours" is the production configuration: the plugin loaded, its
 * gate answered by a stand-in site. "Theirs" is the same configuration without
 * the plugin, so OpenCode's own tools run, and with the skill in OpenCode's
 * skills path. The metadata a tool returns for OpenCode's interface (diffs,
 * diagnostics) is not compared: the model never sees it and the site reads none.
 *
 * Every difference must be declared in DECLARED below, with its reason, or
 * the check fails; a declared difference that no longer shows also fails, so
 * the list stays true.
 *
 * AT AN OPENCODE UPGRADE:
 * 1. Pin the new version in the image and the plugin's `@opencode-ai/plugin`,
 *    and build the image under its own tag, from the repository root:
 *      docker build -t agenthix-agent:<tag> -f site/docker/agent.Dockerfile .
 * 2. From site/, run this check against it:
 *      AGENT_IMAGE=agenthix-agent:<tag> npx vitest run -c vitest.container.config.ts \
 *        opencode-plugin/src/__tests__/toolComparison.container.test.ts
 *    (`npm run test:container` runs it with the others, against `agenthix-agent:latest`.)
 * 3. For each undeclared difference in the report: change our tool to match,
 *    with a unit test, or — if ours is right to differ — add it to DECLARED
 *    with a one-line reason. Remove any entry the report says no longer shows.
 * 4. Where a new OpenCode behaviour is reached by no case, add a case.
 * Set TOOL_COMPARISON_DUMP=<file> to also write both sides' raw results there.
 *
 * Needs Docker and the image (skipped without them). One container, capped at
 * 2 GB and 2 CPUs, removed at the end.
 */
import { execFile, spawnSync } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { OPENCODE_COMMAND_SHELL, OPENCODE_MODELS_FILE, OPENCODE_PLUGIN_URL } from '../../../src/agents/runtime/agentImage'
import { CASES, CMP, SKILL, SKILL_FILES, type Case, type Entry } from './toolComparison.cases'
import { compareRuns, formatDifference, type Difference, type Run } from './toolComparison.diff'

/** A read's text up to the note that says where it stopped, and that note. */
const readParts = (output: string) => {
  const at = output.lastIndexOf('\n\n(')
  return at < 0 ? { body: output, note: '' } : { body: output.slice(0, at), note: output.slice(at) }
}
/** Ours stopped sooner than OpenCode's, at `stop`, and showed the same lines up to there. */
const stoppedSooner = (d: Difference, stop: RegExp) => {
  const ours = readParts(d.ours)
  return d.tool === 'read' && d.field === 'output' && stop.test(ours.note) && d.theirs.startsWith(`${ours.body}\n`)
}
const SHOWING = /^\n\n\(Showing lines (\d+)-(\d+) of \d+\./
const INVALID_ARGS = /^The (\w+) tool was called with invalid arguments: [\s\S]+\.\nPlease rewrite the input so it satisfies the expected schema\.$/

/**
 * Where ours is meant to differ from OpenCode's, each with its reason. Every
 * entry matches only the difference it names; a difference no entry matches
 * fails the check.
 */
const DECLARED: { reason: string; applies: (d: Difference) => boolean }[] = [
  {
    reason: "read shows at most 1,990 lines: OpenCode cuts a plugin tool's output at 2,000 lines, but never its own read's",
    applies: d => {
      const [, first, last] = readParts(d.ours).note.match(SHOWING) ?? []
      return stoppedSooner(d, SHOWING) && Number(last) - Number(first) + 1 === 1990
    },
  },
  {
    reason: "read's 50 KB cap counts the line numbers and leaves room for the rest of the answer, so OpenCode's own 50 KB cut of plugin output never falls",
    applies: d => stoppedSooner(d, /^\n\n\(Output capped at 50 KB\. Showing lines \d+-\d+\./),
  },
  {
    reason: 'invalid arguments are described by zod, not Effect; the message around the description is OpenCode\'s',
    applies: d => d.field === 'error' && INVALID_ARGS.test(d.ours) && INVALID_ARGS.test(d.theirs) &&
      d.ours.match(INVALID_ARGS)?.[1] === d.theirs.match(INVALID_ARGS)?.[1],
  },
  {
    reason: 'read remembers in memory which AGENTS.md it attached to a session, so after a server restart it attaches one once more; OpenCode reads the history',
    applies: d => d.case === 'read-agents-md-restart' && d.tool === 'read' && d.field === 'output' &&
      d.ours.startsWith(`${d.theirs}\n\n<system-reminder>\nInstructions from: `),
  },
  {
    reason: "edit of a path through a file: both give Node's own ENOTDIR text; OpenCode's names the lstat it made, ours the open",
    applies: d => d.tool === 'edit' && d.field === 'error' &&
      d.ours.replace(/^ENOTDIR: not a directory, open /, '') === d.theirs.replace(/^ENOTDIR: not a directory, lstat /, '') &&
      d.ours !== d.theirs,
  },
  {
    reason: "apply_patch moving a link: the gate hands over the source's real path, so the file it leads to is moved and the link left; OpenCode moves through the link and removes the link",
    applies: d => d.case === 'patch-move-link' && d.field === 'files',
  },
  {
    reason: 'apply_patch deleting a link: ours looks only at the link, never at what it leads to, so a dangling link is deleted; OpenCode reads the target first and fails',
    applies: d => d.case === 'patch-delete-dangling-link',
  },
  {
    reason: "skill never offers OpenCode's own built-in customize-opencode: an agent sees only its conversation's staged skills (spec §7)",
    applies: d => d.tool === 'skill' && d.field === 'error' && d.theirs.replace(/, customize-opencode|customize-opencode, /, '') === d.ours,
  },
]

const exec = promisify(execFile)
const IMAGE = process.env.AGENT_IMAGE ?? 'agenthix-agent:latest'
const enabled = spawnSync('docker', ['image', 'inspect', IMAGE], { stdio: 'ignore' }).status === 0
const C = 'ovi-6.7-tool-comparison'
const PASSWORD = 'pw-comparison'
const SERVER_KEY = 'server-key-comparison'
const THEIRS_SKILLS = '/f/skills'
const oursSkills = (conversationId: string) => `/home/appuser/.claude/.tmp/conversation-${conversationId}/skills`

type Side = 'ours' | 'theirs'
type ToolPart = { tool: string; status: string; output?: string; error?: string; attachments?: { mime: string; url: string }[] }

let dir: string
const runs: Record<Side, Map<string, Run>> = { ours: new Map(), theirs: new Map() }

const docker = async (args: string[], timeout = 120_000) => (await exec('docker', args, { timeout, maxBuffer: 256 * 1024 * 1024 })).stdout
const sh = (script: string) => docker(['exec', C, 'sh', '-c', script])
async function driver<T>(op: string, arg?: unknown): Promise<T> {
  const out = await docker(['exec', '-e', `OPENCODE_SERVER_PASSWORD=${PASSWORD}`, C, 'node', '/f/driver.mjs', op, ...(arg ? [JSON.stringify(arg)] : [])], 300_000)
  return JSON.parse(out) as T
}

async function startServer(side: Side) {
  await sh(`pkill -f "[o]pencode serve" ; sleep 1; true`)
  const config = {
    model: 'standin/m1',
    provider: {
      standin: {
        npm: '@ai-sdk/openai-compatible', name: 'Standin',
        options: { baseURL: 'http://127.0.0.1:9100/standin/v1', apiKey: 'placeholder' },
        models: Object.fromEntries(['m1', 'gpt-5-standin'].map(m => [m, { name: m, tool_call: true, limit: { context: 100000, output: 4000 } }])),
      },
    },
    enabled_providers: ['standin'],
    permission: { '*': 'allow', task: 'deny', question: 'deny', skill: 'deny' },
    shell: OPENCODE_COMMAND_SHELL,
    share: 'disabled',
    autoupdate: false,
    ...(side === 'ours' ? { plugin: [OPENCODE_PLUGIN_URL] } : { skills: { paths: [THEIRS_SKILLS] } }),
  }
  const env = {
    OPENCODE_DISABLE_DEFAULT_PLUGINS: '1', OPENCODE_DISABLE_EXTERNAL_SKILLS: '1', OPENCODE_DISABLE_CLAUDE_CODE: '1',
    OPENCODE_DISABLE_LSP_DOWNLOAD: '1', OPENCODE_DISABLE_AUTOUPDATE: '1', OPENCODE_DISABLE_PROJECT_CONFIG: '1',
    OPENCODE_DISABLE_MODELS_FETCH: '1', OPENCODE_DISABLE_SHARE: '1',
    npm_config_offline: 'true', OPENCODE_AUTH_CONTENT: '{}', OPENCODE_MODELS_PATH: OPENCODE_MODELS_FILE,
    OPENCODE_SERVER_PASSWORD: PASSWORD, SITE_HARNESS_KEY: SERVER_KEY,
    OPENCODE_CONFIG_CONTENT: JSON.stringify(config),
    SITE_PLUGIN_CONFIG: JSON.stringify({
      siteUrl: 'http://127.0.0.1:9400', gateTimeoutMs: 10000, turnTimeoutMs: 10000, secretEnv: [], commandEnv: {},
    }),
  }
  await fs.writeFile(path.join(dir, 'fixtures', 'server-env.json'), JSON.stringify(env))
  await docker(['exec', '-d', C, 'node', '/f/start.mjs', side])
  expect(await driver<{ ready: boolean }>('ready')).toEqual({ ready: true })
}

async function writeTree(root: string, files: Record<string, Entry>) {
  await fs.mkdir(root, { recursive: true })
  for (const [rel, entry] of Object.entries(files)) {
    const p = path.join(root, rel)
    await fs.mkdir(path.dirname(p), { recursive: true })
    if (typeof entry === 'object' && 'folder' in entry) await fs.mkdir(p, { recursive: true })
    else if (typeof entry === 'object' && 'link' in entry) await fs.symlink(entry.link, p)
    else await fs.writeFile(p, entry)
  }
}

async function runCase(side: Side, c: Case): Promise<Run> {
  await sh(`rm -rf ${CMP} && cp -a /f/cases/${c.name} ${CMP} && cd ${CMP} && ${c.after ?? 'true'}`)
  const conversationId = `cmp-${c.name}-${side}`
  if (c.skills && side === 'ours') await writeTree(path.join(dir, 'home', '.claude', '.tmp', `conversation-${conversationId}`, 'skills', SKILL), SKILL_FILES)
  const { sessionId } = await driver<{ sessionId: string }>('session', { conversationId, headers: {} })
  const calls: ToolPart[] = []
  for (const [i, steps] of c.turns.entries()) {
    if (i > 0 && c.restart) await startServer(side)
    const model = c.gpt ? { providerID: 'standin', modelID: 'gpt-5-standin' } : undefined
    const t = await driver<{ tools: ToolPart[] }>('turn', { sessionId, steps, model, full: true })
    calls.push(...t.tools)
  }
  if (c.restart) await startServer(side)
  const files = JSON.parse(await docker(['exec', C, 'node', '/f/snapshot.mjs', CMP])) as Record<string, string>
  const skillsRoot = side === 'ours' ? oursSkills(conversationId) : THEIRS_SKILLS
  return { calls, files, skillsRoot }
}

describe.skipIf(!enabled)("Agenthix's file and skill tools beside OpenCode's own", () => {
  const seen = new Set<number>()

  beforeAll(async () => {
    dir = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'ovi-6.7-')))
    for (const d of ['home/.claude/.tmp', 'oc-config', 'fixtures/logs', 'fixtures/cases']) await fs.mkdir(path.join(dir, d), { recursive: true })
    await fs.writeFile(path.join(dir, 'oc-config', '.gitignore'), '*\n')
    for (const f of ['standinModel.mjs', 'standinSite.mjs', 'driver.mjs', 'start.mjs', 'snapshot.mjs']) {
      await fs.copyFile(new URL(`./fixtures/${f}`, import.meta.url), path.join(dir, 'fixtures', f))
    }
    for (const c of CASES) await writeTree(path.join(dir, 'fixtures', 'cases', c.name), c.files)
    await writeTree(path.join(dir, 'fixtures', 'skills', SKILL), SKILL_FILES)
    await docker(['rm', '-f', C]).catch(() => '')
    await docker([
      'run', '-d', '--init', '--memory', '2g', '--cpus', '2', '--network', 'none', '--name', C,
      '-v', `${dir}/home:/home/appuser`,
      '-v', `${dir}/home/.claude/.tmp:/home/appuser/.claude/.tmp:ro`,
      '-v', `${dir}/oc-config:/home/appuser/.config/opencode:ro`,
      '-v', `${dir}/oc-config:/home/appuser/.opencode:ro`,
      '-v', `${dir}/fixtures:/f`,
      '--tmpfs', '/projects:uid=1001,gid=1001,mode=755',
      IMAGE, 'tail', '-f', '/dev/null',
    ])
    await sh('mkdir -p /projects/p1/files')
    await docker(['exec', '-d', C, 'node', '/f/standinModel.mjs'])
    await docker(['exec', '-d', '-e', `SERVER_KEY=${SERVER_KEY}`, C, 'node', '/f/standinSite.mjs'])
    for (const side of ['ours', 'theirs'] as const) {
      await startServer(side)
      for (const c of CASES) runs[side].set(c.name, await runCase(side, c))
    }
    const dump = process.env.TOOL_COMPARISON_DUMP
    if (dump) await fs.writeFile(dump, JSON.stringify({ ours: Object.fromEntries(runs.ours), theirs: Object.fromEntries(runs.theirs) }, null, 2))
  }, 1_200_000)

  afterAll(async () => {
    if (!enabled) return
    await docker(['rm', '-f', C]).catch(() => '')
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {})
  }, 60_000)

  for (const c of CASES) {
    it(c.name, () => {
      const differences = compareRuns(c.name, runs.ours.get(c.name) as Run, runs.theirs.get(c.name) as Run)
      const undeclared: Difference[] = []
      for (const d of differences) {
        const i = DECLARED.findIndex(entry => entry.applies(d))
        if (i < 0) undeclared.push(d)
        else {
          seen.add(i)
          console.log(`declared: ${d.case} call ${d.call} ${d.field}: ${DECLARED[i].reason}`)
        }
      }
      if (undeclared.length > 0) console.log(undeclared.map(formatDifference).join('\n\n'))
      expect(undeclared.map(d => `${d.case} call ${d.call} (${d.tool}) ${d.field}`)).toEqual([])
    })
  }

  it('every declared difference still shows', () => {
    expect(DECLARED.filter((_, i) => !seen.has(i)).map(entry => entry.reason)).toEqual([])
  })
})
