/**
 * The OpenCode runtime against a real agent container (plan 5.9).
 *
 * Run: `npm run test:container` from `site/` (vitest.container.config.ts).
 * Needs docker and the agent image (`AGENT_IMAGE`, `agenthix-agent:latest`
 * by default); skipped when either is missing. Starts ONE container,
 * `ovi-lane1-opencode` (`AGENT_TEST_CONTAINER`), capped at 2 GB and 2 CPUs with
 * no network, and removes it at the end. Calls no model: the model and the
 * platform's tools are the stand-ins in `container/`. The platform's tools run
 * inside the container on its loopback address; the model runs on this
 * machine, where only the site's model relay reaches it. The image's own
 * plugin runs, and reaches the site's real turn, gate and relay handlers,
 * served here over HTTP, through `container/standin-site-tunnel.mjs` — so
 * every tool call passes the real gate, every command gets its tag and
 * environment from the plugin's `shell.env`, and every model request goes
 * through the relay, which adds the key: none is ever in the container.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { execFile, execFileSync, spawn, spawnSync, type ChildProcess } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

vi.mock('#db', () => ({ prisma: { toolCallLog: { create: vi.fn().mockResolvedValue({}) } } }))
// The gate's path check, which a test can switch to allow every path: a link
// swapped in after the check is the case left to what the tool itself runs.
const pathCheck = vi.hoisted(() => ({ allowEveryPath: false }))
vi.mock('../../harnessPathRule', async importOriginal => {
  const real = await importOriginal<typeof import('../../harnessPathRule')>()
  return {
    ...real,
    resolveHarnessPaths: (...args: Parameters<typeof real.resolveHarnessPaths>) =>
      pathCheck.allowEveryPath ? Promise.resolve({ realPaths: {} }) : real.resolveHarnessPaths(...args),
  }
})
vi.mock('../../../../server/siteConfig', () => ({ getAgentFacingSiteUrl: () => 'http://127.0.0.1:1' }))
// The container has no network, so its requests reach the relay through the
// tunnel, whose end here makes them from this machine's loopback address: that
// is the container's address as the relay's source check knows it, checked
// exactly, as on a network the site shares with the container.
vi.mock('../../../../server/modelRelay/relaySource', async importOriginal => {
  const real = await importOriginal<typeof import('../../../../server/modelRelay/relaySource')>()
  return {
    ...real,
    checkRelaySource: real.createSourceCheck({ containerAddress: async () => '127.0.0.1', forwardedByVm: async () => false, now: Date.now }),
  }
})

import { OpenCodeRuntime } from '../../OpenCodeRuntime'
import { OpenCodeServers } from '../openCodeServers'
import { ProcessRelay, dockerRelaySpawn } from '../openCodeRelay'
import { requireLandlock } from '../../landlockCheck'
import { openCodeConnectionName } from '../openCodeConnection'
import { OPENCODE_KEY_PLACEHOLDER } from '../openCodeConfig'
import { pointConversationToken } from '../../../../server/runtime/conversationTokens'
import { serveSite, type ServedSite, type SiteCall } from './containerSite'
import { HARNESS_GATE_PATH, HARNESS_TURN_PATH } from '@agenthix/core'
import type { HarnessSessionStore } from '../openCodeSessions'
import type { RunContext, RunEvent } from '../../types'
import type { RunSkillInputs } from '../../skillSources'
import { PLAIN_TEXT_LINE, pickedSkillInstruction, pickedSkillReadInstruction } from '../../pickedSkill'
import { openCodeSkillsDirs } from '../openCodeSkills'
import { cacheInstalledSkills, installedOnly } from '../../__tests__/installedSkillFixture'

const IMAGE = process.env.AGENT_IMAGE ?? 'agenthix-agent:latest'
const NAME = process.env.AGENT_TEST_CONTAINER ?? 'ovi-lane1-opencode'
const HERE = path.dirname(fileURLToPath(import.meta.url))
const available = spawnSync('docker', ['image', 'inspect', IMAGE], { stdio: 'ignore' }).status === 0

const docker = (...args: string[]) => execFileSync('docker', args, { encoding: 'utf8', timeout: 60_000 })
const inContainer = (script: string) => spawnSync('docker', ['exec', '-u', 'appuser', NAME, 'sh', '-c', script], { encoding: 'utf8', timeout: 60_000 })

const SITE_URL = 'http://127.0.0.1:9300'
const TURN_KEY = 'sk-compatible-turn-key'

let root: string
let home: string
let packages: RunContext['packages']
let site: ServedSite | undefined
let model: ChildProcess | undefined
let modelUrl: string
const siteCalls: SiteCall[] = []
let logs: string
let servers: OpenCodeServers
let runtime: OpenCodeRuntime
const rows: Record<string, { harnessSessionId: string | null; title: string | null }> = {}
const store: HarnessSessionStore = {
  read: async id => rows[id] ?? null,
  write: async (id, harnessSessionId) => { rows[id] = { ...(rows[id] ?? { title: null }), harnessSessionId } },
}

const passwords: string[] = []
let skills: RunSkillInputs | null = null
const siteRootBefore = process.env.SITE_ROOT
let runs = 0
function context(sessionId: string, prompt: string, over: Partial<RunContext> = {}): RunContext {
  return {
    runId: `run-${++runs}`, sessionId, taskId: null, projectId: null,
    model: 'openai_compatible/m1', prompt,
    agent: { id: 'a', handle: 'ada', name: 'Ada', systemPrompt: 'You are Ada, a test agent.', defaultModel: 'openai_compatible/m1' },
    containerName: NAME, cwd: '/projects/p1/files',
    mcpServers: { platform: { type: 'http', url: 'http://127.0.0.1:9200/mcp' } },
    capability: { jwt: 'jwt', expiresAt: Date.now() + 3_600_000 },
    credential: { kind: 'apiKey', provider: 'openai_compatible', apiKey: TURN_KEY, baseUrl: modelUrl },
    // A chat's manifest approving every command: a run with none refuses `ask` tools.
    approvedManifest: { tools: [], bashPatterns: ['*'], approvedAt: new Date(0).toISOString() },
    riskRules: null, packages, boundaryOverride: null, skills,
    claudeHome: { serverDir: path.join(home, '.claude'), visibleDir: '/home/appuser/.claude' }, workingTreeDir: '/projects/p1/files',
    abortSignal: new AbortController().signal,
    ...over,
  }
}

async function turn(ctx: RunContext): Promise<RunEvent[]> {
  const out: RunEvent[] = []
  for await (const e of runtime.run(ctx)) out.push(e)
  return out
}

const steps = (...s: Array<Array<{ name: string; args: Record<string, unknown> }>>) => `DIRECTIVE:STEPS ${JSON.stringify(s)}`
const results = (events: RunEvent[]) => events.filter((e): e is Extract<RunEvent, { type: 'tool_result' }> => e.type === 'tool_result').map(e => e.output)
type ModelRequest = { n: number; url: string; authorization: string | null; tools: string[]; messages: number; lastUser: string; toolResults: string[]; system: string }
const modelLog = (): ModelRequest[] =>
  fs.readFileSync(path.join(root, 'model.jsonl'), 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l))
const mcpLog = (): Array<{ token: string; call: string; args: unknown }> =>
  (fs.existsSync(path.join(logs, 'mcp.jsonl')) ? fs.readFileSync(path.join(logs, 'mcp.jsonl'), 'utf8').trim().split('\n').filter(Boolean) : []).map(l => JSON.parse(l))

async function until(what: string, check: () => boolean, ms = 30_000): Promise<void> {
  const deadline = Date.now() + ms
  while (!check()) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`)
    await new Promise(r => setTimeout(r, 200))
  }
}

describe.skipIf(!available)('the OpenCode runtime in an agent container', () => {
  const convA = `conv-a-${Date.now()}`
  const convB = `conv-b-${Date.now()}`
  const connA = openCodeConnectionName(convA)
  const connB = openCodeConnectionName(convB)

  beforeAll(async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'oc-container-'))
    home = path.join(root, 'home')
    logs = path.join(root, 'logs')
    const config = path.join(root, 'opencode-config')
    const project = path.join(root, 'project')
    const pkgs = path.join(root, 'packages')
    packages = { platformDir: path.join(pkgs, 'platform'), orgDir: null, agentDir: path.join(pkgs, 'agent'), refs: {} as RunContext['packages']['refs'] }
    for (const d of [home, path.join(home, '.config', 'opencode'), path.join(home, '.opencode'), path.join(home, '.claude', '.tmp'), logs, config, project, path.join(project, '.opencode'), path.join(pkgs, 'platform', 'skills'), path.join(pkgs, 'agent')]) {
      fs.mkdirSync(d, { recursive: true })
      fs.chmodSync(d, 0o777)
    }
    fs.writeFileSync(path.join(config, '.gitignore'), 'node_modules\npackage.json\npackage-lock.json\nbun.lock\n.gitignore', { mode: 0o444 })
    fs.writeFileSync(path.join(project, 'notes.txt'), 'The codeword is PERSIMMON-42.\n')
    // The agent's skill comes as hq gives it: installed for the agent, its content in the site's package cache.
    process.env.SITE_ROOT = path.join(root, 'site')
    skills = installedOnly(await cacheInstalledSkills({
      probe: { 'SKILL.md': '---\nname: probe\ndescription: A skill staged for the test.\n---\n\nThe probe skill.\n' },
      // Only a person invokes it: a pick tells the model to read its file.
      'by-hand': { 'SKILL.md': '---\nname: by-hand\ndescription: Run only when a person picks it.\ndisable-model-invocation: true\n---\n\nThe by-hand skill.\n' },
    }))
    // Configuration an agent could write into its project: never read.
    const planted = JSON.stringify({ permission: { task: 'allow', question: 'allow', bash: 'deny', [`${connB}_*`]: 'allow' } })
    fs.writeFileSync(path.join(project, 'opencode.json'), planted)
    fs.writeFileSync(path.join(project, '.opencode', 'opencode.json'), planted)

    spawnSync('docker', ['rm', '-f', NAME], { stdio: 'ignore' })
    docker('run', '-d', '--init', '--name', NAME, '--memory', '2g', '--cpus', '2', '--pids-limit', '4096', '--network', 'none',
      '-v', `${home}:/home/appuser`,
      '-v', `${path.join(home, '.claude', '.tmp')}:/home/appuser/.claude/.tmp:ro`,
      '-v', `${config}:/home/appuser/.config/opencode:ro`,
      '-v', `${config}:/home/appuser/.opencode:ro`,
      '-v', `${project}:/projects/p1/files`,
      '-v', `${path.join(HERE, 'container')}:/standin:ro`,
      '-v', `${logs}:/standin-logs`,
      IMAGE, 'tail', '-f', '/dev/null')
    docker('exec', '-d', NAME, 'node', '/standin/standin-mcp.mjs')
    await until('the platform-tool stand-in', () => inContainer('curl -s -o /dev/null http://127.0.0.1:9200/').status === 0)
    // The model, on this machine: the container, which has no network, reaches it only through the relay.
    // Its log, which holds the key it was sent, is outside everything the container sees.
    model = spawn('node', [path.join(HERE, 'container', 'standin-model.mjs')], { env: { ...process.env, PORT: '0', LOG: path.join(root, 'model.jsonl') }, stdio: ['ignore', 'pipe', 'ignore'] })
    const port = await new Promise<string>((resolve, reject) => {
      model!.stdout!.once('data', (d: Buffer) => resolve(d.toString().trim()))
      model!.once('exit', () => reject(new Error('the stand-in model exited')))
    })
    modelUrl = `http://127.0.0.1:${port}/v1`
    // Asked without blocking: this process answers the tunnel's requests itself.
    site = await serveSite(NAME, siteCalls)
    const reachesSite = () => new Promise<boolean>(resolve =>
      execFile('docker', ['exec', NAME, 'curl', '-s', '-o', '/dev/null', '--max-time', '5', `${SITE_URL}/`], { timeout: 10_000 }, err => resolve(!err)))
    const deadline = Date.now() + 30_000
    while (!(await reachesSite())) {
      if (Date.now() > deadline) throw new Error('timed out waiting for the site tunnel')
    }

    servers = new OpenCodeServers({
      spawnRelay: (name, handlers) => {
        const relay = new ProcessRelay(dockerRelaySpawn(name), handlers)
        const start = relay.start.bind(relay)
        relay.start = (argv, env, port, timeoutMs) => {
          passwords.push(env.OPENCODE_SERVER_PASSWORD)
          return start(argv, env, port, timeoutMs)
        }
        return relay
      },
      checkLandlock: name => requireLandlock(name),
      siteUrl: () => SITE_URL,
      readyDeadlineMs: 60_000,
    })
    runtime = new OpenCodeRuntime({ servers, store })
  })

  afterAll(async () => {
    if (servers) await servers.stop(NAME)
    await site?.close()
    model?.kill()
    spawnSync('docker', ['rm', '-f', NAME], { stdio: 'ignore' })
    if (siteRootBefore === undefined) delete process.env.SITE_ROOT
    else process.env.SITE_ROOT = siteRootBefore
    if (root) fs.rmSync(root, { recursive: true, force: true })
  })

  it('runs a turn end to end against the stand-in model, with the model OpenCode reports', async () => {
    const events = await turn(context(convA, 'Say hello.'))
    expect(events.filter(e => e.type === 'text_delta').map(e => (e as { textDelta: string }).textDelta).join('')).toBe('OK')
    expect(events.at(-1)).toMatchObject({ type: 'status', status: 'completed', model: 'openai_compatible/m1' })
    expect(rows[convA].harnessSessionId).toMatch(/^ses_/)
    expect(inContainer("pgrep -f '[o]pencode serve' | wc -l").stdout.trim()).toBe('1')
    // The plugin asked the site for the turn, and was given a relay token, never the key.
    const answered = siteCalls.filter(c => c.url === HARNESS_TURN_PATH && (c.body as { turn: unknown }).turn !== null)
    expect(answered.length).toBeGreaterThan(0)
    for (const c of answered) {
      expect(Object.keys((c.body as { turn: { modelHeaders: object } }).turn.modelHeaders)).toEqual(['x-agenthix-turn'])
      expect(JSON.stringify(c.body)).not.toContain(TURN_KEY)
    }
    // Every model request went through the relay, which put the turn's key on it.
    const relayed = siteCalls.filter(c => c.url.startsWith('/api/v1/model-relay/openai_compatible/'))
    const requests = modelLog().filter(r => r.url.includes('/chat/completions'))
    expect(requests.length).toBeGreaterThan(0)
    expect(relayed.map(c => c.status)).toEqual(requests.map(() => 200))
    for (const r of requests) expect(r.authorization).toBe(`Bearer ${TURN_KEY}`)
  })

  it('addresses every provider at the relay, and holds no provider key or address anywhere in the container during a turn', async () => {
    const server = () => inContainer("pgrep -f '[o]pencode serve' | head -1").stdout.trim()
    // As the harness's own user, outside any command's sandbox: its home, and
    // every process's environment and command line. The key is given to grep
    // in a file, so the scan's own command lines do not carry it.
    const scan = () => inContainer([
      `echo ${Buffer.from(TURN_KEY).toString('base64')} | base64 -d > /tmp/key-pattern`,
      'grep -r -l -a -F -f /tmp/key-pattern /home/appuser /standin-logs 2>/dev/null',
      'for f in /proc/[0-9]*/environ /proc/[0-9]*/cmdline; do grep -l -a -F -f /tmp/key-pattern "$f" 2>/dev/null; done',
      `grep -c -a -F '${passwords.at(-1)}' /proc/${server()}/environ`,
      'echo scanned',
    ].join('\n'))
    const turnDone = turn(context(convA, steps([{ name: 'bash', args: { command: 'sleep 4; echo slept', description: 'x' } }])))
    await until('the command to be running', () => inContainer("pgrep -f '[s]leep 4' | wc -l").stdout.trim() !== '0')
    const during = scan()
    const events = await turnDone
    expect(results(events).join('\n')).toContain('slept')

    // The scan could read the server's environment — it found the password there — and found no key.
    expect(during.stdout.trim().split('\n')).toEqual(['1', 'scanned'])
    expect(docker('inspect', '--format', '{{json .Config.Env}}', NAME)).not.toContain(TURN_KEY)
    const environ = inContainer(`tr '\\0' '\\n' < /proc/${server()}/environ | grep '^OPENCODE_CONFIG_CONTENT='`).stdout
    const config = JSON.parse(environ.slice('OPENCODE_CONFIG_CONTENT='.length)) as { provider: Record<string, { options: { baseURL: string; apiKey: string } }> }
    for (const [id, p] of Object.entries(config.provider)) {
      expect(p.options.baseURL).toBe(`${SITE_URL}/api/v1/model-relay/${id}${id === 'anthropic' ? '/v1' : ''}`)
      expect(p.options.apiKey).toBe(OPENCODE_KEY_PLACEHOLDER)
    }
    expect(environ).not.toContain(modelUrl)
  })

  it('refuses a model request from a command, which holds no relay token', async () => {
    const before = modelLog().length
    const events = await turn(context(convA, steps([{ name: 'bash', args: {
      command: `curl -s -o /dev/null -w '%{http_code}' -X POST -H 'content-type: application/json' -d '{"model":"m1"}' ${SITE_URL}/api/v1/model-relay/openai_compatible/chat/completions`,
      description: 'x',
    } }])))
    expect(results(events).join('\n')).toContain('401')
    // Only the turn's own two requests reached the model: the command's never did.
    expect(modelLog().slice(before).map(r => r.authorization)).toEqual([`Bearer ${TURN_KEY}`, `Bearer ${TURN_KEY}`])
  })

  it('shows the model only its own tools, whatever the project\'s configuration says, and no skills list of OpenCode\'s own', () => {
    const first = modelLog().find(r => r.tools.length > 0)!
    expect(first.tools).toEqual(expect.arrayContaining(['bash', 'read', 'edit', 'write', 'glob', 'grep', 'webfetch', 'todowrite', `${connA}_stamp`, `${connA}_whoami`]))
    expect(first.tools).not.toContain('task')
    expect(first.tools).not.toContain('question')
    expect(first.tools).not.toContain('websearch')
    expect(first.system).not.toContain('customize-opencode')
    expect(first.system).toContain('<name>agent-probe</name>')
    expect(first.system).toContain('<location>/home/appuser/.claude/.tmp/')
  })

  it('tells the model to load a skill the person picked, which then loads by its name (security review M7)', async () => {
    const before = modelLog().length
    const prompt = steps([{ name: 'skill', args: { name: 'agent-probe' } }])
    const events = await turn(context(convA, prompt, { pickedSkill: 'agent-probe' }))
    const sent = modelLog().slice(before).filter(r => r.lastUser.includes('DIRECTIVE:STEPS'))
    expect(sent[0]!.lastUser).toBe(`${pickedSkillInstruction('agent-probe')}\n\n${prompt}`)
    expect(results(events).join('\n')).toContain('The probe skill.')

    const unknown = modelLog().length
    await turn(context(convA, 'Say hello.', { pickedSkill: 'agent-no-such-skill' }))
    expect(modelLog().slice(unknown).map(r => r.lastUser)).not.toContainEqual(expect.stringContaining('The person picked the skill'))
  })

  it('tells the model to read the file of a picked skill the model may not load itself, and the read runs', async () => {
    const skillFile = path.posix.join(openCodeSkillsDirs(context(convA, '').claudeHome, convA).visibleDir, 'agent-by-hand', 'SKILL.md')
    const before = modelLog().length
    const prompt = steps([{ name: 'read', args: { filePath: skillFile } }])
    const events = await turn(context(convA, prompt, { pickedSkill: 'agent-by-hand' }))
    const sent = modelLog().slice(before).filter(r => r.lastUser.includes('DIRECTIVE:STEPS'))
    expect(sent[0]!.lastUser).toBe(`${pickedSkillReadInstruction('agent-by-hand', skillFile)}\n\n${prompt}`)
    expect(results(events).join('\n')).toContain('The by-hand skill.')
  })

  it.each(['/init', '/compact', '/agent-probe', '/no-such-command'])('sends a typed %s to the model as plain text, never running it', async (typed) => {
    const before = modelLog().length
    const events = await turn(context(convA, typed))
    const sent = modelLog().slice(before).filter(r => r.url.includes('/chat/completions') && r.tools.length > 0)
    expect(sent.map(r => r.lastUser)).toEqual([`${PLAIN_TEXT_LINE}\n\n${typed}`])
    expect(events.filter(e => e.type === 'text_delta').map(e => (e as { textDelta: string }).textDelta).join('')).toBe('OK')
    expect(events.filter(e => e.type === 'compacted')).toEqual([])
  })

  it('asks the site\'s gate before every tool call: a read in the project runs, one in the harness home does not', async () => {
    fs.writeFileSync(path.join(home, 'secret.txt'), 'HARNESS-HOME-SECRET\n')
    const gateBefore = siteCalls.filter(c => c.url === HARNESS_GATE_PATH).length
    const events = await turn(context(convA, steps(
      [{ name: 'read', args: { filePath: '/projects/p1/files/notes.txt' } }],
      [{ name: 'read', args: { filePath: '/home/appuser/secret.txt' } }],
    )))
    const [inProject, inHome] = results(events)
    expect(inProject).toContain('PERSIMMON-42')
    expect(inHome).not.toContain('HARNESS-HOME-SECRET')
    const decisions = siteCalls.filter(c => c.url === HARNESS_GATE_PATH).slice(gateBefore).map(c => (c.body as { decision: string }).decision)
    expect(decisions).toEqual(['allow', 'refuse'])
    expect(modelLog().at(-1)!.toolResults.join('\n')).not.toContain('HARNESS-HOME-SECRET')
  })

  it('runs grep and glob\'s rg contained: a link into the harness home or to /proc/self leads nowhere, the project searches as before', async () => {
    const server = inContainer("pgrep -f '[o]pencode serve' | head -1").stdout.trim()
    expect(server).toMatch(/^\d+$/)
    fs.writeFileSync(path.join(home, 'secret.txt'), 'HARNESS-HOME-SECRET\n')
    inContainer('cd /projects/p1/files && ln -sfn /home/appuser to-home && ln -sfn /proc/self to-proc')
    // The harness's own permissions reach both: the real rg, run as the harness, finds each.
    expect(inContainer('/usr/bin/rg -l HARNESS-HOME-SECRET /projects/p1/files/to-home/').stdout).toContain('secret.txt')
    expect(inContainer(`/usr/bin/rg -l --no-messages r-xp /proc/${server}/`).stdout).toMatch(/\/maps$/m)

    pathCheck.allowEveryPath = true
    try {
      const events = await turn(context(convA, steps(
        [{ name: 'grep', args: { pattern: 'HARNESS-HOME-SECRET', path: '/projects/p1/files/to-home' } }],
        [{ name: 'glob', args: { pattern: '**/*', path: '/projects/p1/files/to-home' } }],
        [{ name: 'grep', args: { pattern: 'r-xp', path: '/projects/p1/files/to-proc' } }],
        [{ name: 'grep', args: { pattern: passwords.at(-1)!, path: '/projects/p1/files/to-proc' } }],
        [{ name: 'grep', args: { pattern: 'PERSIMMON', path: '/projects/p1/files' } }],
        [{ name: 'glob', args: { pattern: '*.txt', path: '/projects/p1/files' } }],
        // A command's own rg starts the launcher again, inside the command's sandbox.
        [{ name: 'bash', args: { command: 'rg -c PERSIMMON /projects/p1/files/notes.txt; echo "exit=$?"; rg -l HARNESS /home/appuser; echo "home=$?"', description: 'x' } }],
      )))
      const [homeGrep, homeGlob, procMaps, procPassword, projectGrep, projectGlob, command] = results(events)
      expect(homeGrep).toBe('No files found')
      expect(homeGlob).toBe('No files found')
      expect(procMaps).toBe('No files found')
      expect(procPassword).toBe('No files found')
      expect(projectGrep).toContain('/projects/p1/files/notes.txt:')
      expect(projectGrep).toContain('Line 1: The codeword is PERSIMMON-42.')
      expect(projectGlob).toBe('/projects/p1/files/notes.txt')
      expect(command).toMatch(/^1\nexit=0\n/)
      expect(command).toContain('home=2')
      const seen = [...results(events), ...modelLog().at(-1)!.toolResults].join('\n')
      for (const secret of ['HARNESS-HOME-SECRET', ...passwords]) expect(seen).not.toContain(secret)
    } finally {
      pathCheck.allowEveryPath = false
      inContainer('rm -f /projects/p1/files/to-home /projects/p1/files/to-proc')
    }
  })

  it('never reads auth.json: a key planted there does not reach the provider', async () => {
    const data = path.join(home, '.local', 'share', 'opencode')
    fs.writeFileSync(path.join(data, 'auth.json'), JSON.stringify({ openai_compatible: { type: 'api', key: 'FROM-AUTH-JSON' } }))
    const before = modelLog().length
    // A keyless endpoint: the relay drops the placeholder OpenCode sends and adds no key.
    await turn(context(convA, 'Again.', { credential: { kind: 'apiKey', provider: 'openai_compatible', apiKey: '', baseUrl: modelUrl } }))
    const later = modelLog().slice(before)
    expect(later.length).toBeGreaterThan(0)
    for (const r of later) expect(r.authorization).toBeNull()
  })

  it('keeps the configuration folders out of reach of the harness user and its commands', async () => {
    const asHarness = inContainer('touch /home/appuser/.config/opencode/x 2>&1; rm -rf /home/appuser/.opencode 2>&1; mv /home/appuser/.config/opencode /home/appuser/moved 2>&1; ls -a /home/appuser/.config/opencode')
    expect(asHarness.stdout).toMatch(/Read-only file system/)
    expect(asHarness.stdout).toMatch(/(Resource busy|Read-only file system)/)
    expect(asHarness.stdout).not.toMatch(/^x$/m)

    const events = await turn(context(convA, steps([{ name: 'bash', args: { command: 'echo planted > /home/appuser/.config/opencode/opencode.json; echo "exit=$?"', description: 'x' } }])))
    expect(results(events).join('\n')).toMatch(/exit=[1-9]/)
    expect(fs.readdirSync(path.join(root, 'opencode-config'))).toEqual(['.gitignore'])
  })

  it('keeps the harness from its commands: no password, no home, no signal, and its background processes survive', async () => {
    const script = [
      "SP=$(pgrep -f '[o]pencode serve' | head -1)",
      'echo "pid=$SP"',
      'cat /proc/$SP/environ >/dev/null 2>&1 && echo environ=readable || echo environ=refused',
      'cat /proc/$SP/mem >/dev/null 2>&1 && echo mem=readable || echo mem=refused',
      'ls /home/appuser >/dev/null 2>&1 && echo home=readable || echo home=refused',
      'kill -0 $SP 2>/dev/null && echo signal=allowed || echo signal=refused',
      'env | grep -q "^OPENCODE_SERVER_PASSWORD=." && echo passwordenv=present || echo passwordenv=absent',
      'env | grep -q "^SITE_HARNESS_KEY=." && echo keyenv=present || echo keyenv=absent',
      'env | grep -q "^SITE_PLUGIN_CONFIG=." && echo pluginenv=present || echo pluginenv=absent',
      `echo "turnkey=$(env | grep -c -a '${TURN_KEY}')"`,
      'echo "tag=${SITE_SESSION:-none}"',
      'echo "pwfiles=$(grep -l -a "^OPENCODE_SERVER_PASSWORD=." /proc/[0-9]*/environ 2>/dev/null | wc -l)"',
      `echo "pwvalue=$(cat /proc/[0-9]*/environ 2>/dev/null | grep -c -a '${passwords.at(-1)}')"`,
      'echo "home=$HOME"',
      'nohup sleep 3127 >/dev/null 2>&1 &',
      'echo bg=started',
    ].join('\n')
    const events = await turn(context(convA, steps([{ name: 'bash', args: { command: script, description: 'x' } }])))
    const out = results(events).join('\n')
    expect(out).toMatch(/pid=\d+/)
    expect(out).toContain('environ=refused')
    expect(out).toContain('mem=refused')
    expect(out).toContain('home=refused')
    expect(out).toContain('signal=refused')
    expect(out).toContain('passwordenv=absent')
    expect(out).toContain('keyenv=absent')
    expect(out).toContain('pluginenv=absent')
    expect(out).toMatch(/turnkey=0/)
    expect(out).toContain(`tag=${convA}`)
    expect(out).toMatch(/pwfiles=\s*0/)
    expect(out).toMatch(/pwvalue=0/)
    expect(out).toContain('home=/home/agent')
    expect(out).toContain('bg=started')
    expect(inContainer("pgrep -f '[s]leep 3127' | wc -l").stdout.trim()).not.toBe('0')
  })

  it('kills a command at its time limit', async () => {
    const t0 = Date.now()
    const events = await turn(context(convA, steps([{ name: 'bash', args: { command: 'sleep 30; echo late', timeout: 1500, description: 'x' } }])))
    expect(Date.now() - t0).toBeLessThan(25_000)
    expect(results(events).join('\n')).not.toContain('late')
    expect(events.at(-1)).toMatchObject({ status: 'completed' })
  })

  it('serves two conversations at once on one server, each with only its own connection and token', async () => {
    const [a, b] = await Promise.all([
      turn(context(convA, steps([{ name: `${connA}_stamp`, args: { note: 'from-a' } }]))),
      turn(context(convB, steps([{ name: `${connB}_stamp`, args: { note: 'from-b' } }]))),
    ])
    expect(results(a)).toEqual(['receipt:from-a'])
    expect(results(b)).toEqual(['receipt:from-b'])
    expect(inContainer("pgrep -f '[o]pencode serve' | wc -l").stdout.trim()).toBe('1')

    const tokenA = pointConversationToken(convA, 'probe', { jwt: 'j', expiresAt: Date.now() + 60_000 })
    const tokenB = pointConversationToken(convB, 'probe', { jwt: 'j', expiresAt: Date.now() + 60_000 })
    const calls = mcpLog()
    expect(calls.find(c => (c.args as { note?: string })?.note === 'from-a')?.token).toBe(tokenA)
    expect(calls.find(c => (c.args as { note?: string })?.note === 'from-b')?.token).toBe(tokenB)
    for (const r of modelLog()) {
      expect(r.tools.some(t => t.startsWith(`${connA}_`)) && r.tools.some(t => t.startsWith(`${connB}_`))).toBe(false)
    }
  })

  it('resumes a conversation after its server is killed, from the home', async () => {
    const before = modelLog().length
    inContainer("kill -9 $(pgrep -f '[o]pencode serve')")
    await until('the server to be seen gone', () => !servers.isRunning(NAME))
    await expect(runtime.sessionExists({ sessionId: convA, harnessHomeDir: home, workingDirectory: '/projects/p1/files', containerName: NAME })).resolves.toBe(true)
    const events = await turn(context(convA, 'After the restart.'))
    expect(events.at(-1)).toMatchObject({ status: 'completed' })
    const resumed = modelLog().slice(before).at(-1)!
    expect(resumed.messages).toBeGreaterThan(4)
    expect(resumed.tools).toEqual(expect.arrayContaining([`${connA}_stamp`]))
    expect(inContainer("pgrep -f '[o]pencode serve' | wc -l").stdout.trim()).toBe('1')
  })

  it('reads only a 404 as gone, so a conversation whose session is missing is closed', async () => {
    rows['conv-missing'] = { harnessSessionId: 'ses_ffffffffffffZZZZZZZZZZZZZZ', title: null }
    await expect(runtime.sessionExists({ sessionId: 'conv-missing', harnessHomeDir: home, workingDirectory: '/projects/p1/files', containerName: NAME })).resolves.toBe(false)
  })

  it('stops the server when its last conversation goes idle', async () => {
    await runtime.conversationIdle({ sessionId: convA, containerName: NAME })
    expect(servers.isRunning(NAME)).toBe(true)
    await runtime.endConversation({ sessionId: convB, containerName: NAME })
    expect(servers.isRunning(NAME)).toBe(false)
    await until('the server process to end', () => inContainer("pgrep -f '[o]pencode serve' | wc -l").stdout.trim() === '0', 20_000)
    expect(fs.existsSync(path.join(home, '.local', 'share', 'opencode', 'auth.json'))).toBe(false)
  })
})
