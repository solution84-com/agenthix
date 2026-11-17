/**
 * A turn's staged skills reach a real `claude` process in the agent image
 * (adr-0084), with a stand-in for the Anthropic API — never a real model.
 *
 * Run with `npm run test:container` from site/ (vitest.container.config.ts).
 * It needs Docker and the agent image (AGENT_IMAGE,
 * `agenthix-agent:latest` by default), and is skipped when either is missing.
 * One container, capped at 2 GB and 2 CPUs, removed at the end. The stand-in
 * runs on this machine and logs every request body the process sends, which
 * is what these checks read: the tools the model was given, the skills it was
 * shown, and what a loaded skill put in front of it.
 */
import { execFile, spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'

vi.mock('#db', () => ({ prisma: { toolCallLog: { create: vi.fn().mockResolvedValue({}) } } }))

import { ClaudeSDKRuntime } from '../ClaudeSDKRuntime'
import type { RunContext, RunEvent } from '../types'
import { claudeTestContext } from './claudeTestContext'
import { cacheInstalledSkills, installedOnly } from './installedSkillFixture'
import type { RunSkillInputs } from '../skillSources'
import { PLAIN_TEXT_LINE, pickedSkillInstruction, pickedSkillReadInstruction } from '../pickedSkill'

const run = promisify(execFile)
const IMAGE = process.env.AGENT_IMAGE ?? 'agenthix-agent:latest'
const enabled = spawnSync('docker', ['image', 'inspect', IMAGE], { stdio: 'ignore' }).status === 0
const CONTAINER = process.env.AGENT_CLAUDE_SKILLS_TEST_CONTAINER ?? 'ovi-skill-claude-test'
const CWD = '/projects/p1/files'
const INSTRUCTIONS = 'Say HELLO-FROM-THE-SKILL-7731.'
const PROBE_INSTRUCTIONS = 'PROBE-INSTRUCTIONS-5520'

let dir: string
let standin: ChildProcess | undefined
let port = ''
let skills: RunSkillInputs | null = null
const siteRootBefore = process.env.SITE_ROOT
const runtime = new ClaudeSDKRuntime()
const sessionId = randomUUID()
const docker = async (...args: string[]) => (await run('docker', args, { timeout: 60_000 })).stdout

const restricted: Partial<RunContext> = {
  bypassed: false,
  allowedTools: [{ name: 'read_file', state: 'always' }],
  approvedManifest: { tools: [], bashPatterns: [], approvedAt: 't' },
}

function context(overrides: Partial<RunContext> = {}): RunContext {
  return claudeTestContext({
    runId: randomUUID(),
    sessionId,
    cwd: CWD,
    model: 'claude-sonnet-4-5',
    bypassed: true,
    isNewSession: false,
    containerName: CONTAINER,
    credential: null,
    claudeHome: { serverDir: path.join(dir, 'home', '.claude'), visibleDir: '/home/appuser/.claude' },
    runStaging: { serverDir: path.join(dir, 'run-staging'), visibleDir: '/run/staging' },
    skills,
    packages: {
      refs: { agent: { kind: 'agent', key: 'a', digest: 'a'.repeat(64) }, org: null, platform: { kind: 'platform', key: 'platform', digest: 'b'.repeat(64) } },
      agentDir: path.join(dir, 'pkg', 'agent'),
      orgDir: null,
      platformDir: path.join(dir, 'pkg', 'platform'),
    },
    // Not what a real run's git helper carries: the way this test points the
    // process at the stand-in and keeps anything else from leaving.
    gitCredEnv: {
      ANTHROPIC_BASE_URL: `http://host.docker.internal:${port}`, ANTHROPIC_API_KEY: 'sk-standin-skills',
      HTTPS_PROXY: 'http://127.0.0.1:9', HTTP_PROXY: 'http://127.0.0.1:9', NO_PROXY: '127.0.0.1,localhost,host.docker.internal',
      DISABLE_AUTOUPDATER: '1', CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
    },
    ...overrides,
  })
}

type Request = { id: number; body: { tools?: Array<{ name: string }>; messages?: unknown[] } }
const requests = async (): Promise<Request[]> =>
  (await fs.readFile(path.join(dir, 'bodies.jsonl'), 'utf8').catch(() => '')).trim().split('\n').filter(Boolean).map(l => JSON.parse(l) as Request)

/** One turn, and the model requests it made. */
async function turn(prompt: string, overrides: Partial<RunContext> = {}): Promise<{ events: RunEvent[]; sent: Request[] }> {
  const before = (await requests()).length
  const events: RunEvent[] = []
  for await (const e of runtime.run(context({ prompt, ...overrides }))) events.push(e)
  return { events, sent: (await requests()).slice(before) }
}

const toolNames = (r: Request) => (r.body.tools ?? []).map(t => t.name)
const text = (r: Request) => JSON.stringify(r.body.messages ?? [])
// The turn's own message: a kept process sends the conversation's earlier turns too, so a check about this turn
// reads only the newest message from the person.
const lastUserText = (r: Request) => {
  const messages = (r.body.messages ?? []) as Array<{ role?: string }>
  return JSON.stringify(messages.filter(m => m.role === 'user').at(-1) ?? null)
}
// The request's text as it reads inside the JSON these helpers return: quotes escaped.
const asJson = (s: string) => JSON.stringify(s).slice(1, -1)
/** The skill list Claude Code puts in a reminder, one `name: description` per line. */
const listed = (r: Request) => [...text(r).matchAll(/\\n- (\S+?): /g)].map(m => m[1])
  .filter(() => text(r).includes('skills are available for use with the Skill tool'))
const results = (events: RunEvent[]) => events.flatMap(e => e.type === 'tool_result' ? [e.output] : [])

describe.skipIf(!enabled)("a turn's staged skills, in a real claude process", () => {
  beforeAll(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ovi-skill-'))
    await fs.mkdir(path.join(dir, 'home', '.claude'), { recursive: true })
    await fs.writeFile(path.join(dir, 'home', '.claude.json'), '{}')
    await fs.mkdir(path.join(dir, 'project', 'files'), { recursive: true })
    await fs.writeFile(path.join(dir, 'project', 'files', 'x.txt'), 'x\n')
    await fs.mkdir(path.join(dir, 'pkg', 'platform', 'skills'), { recursive: true })
    await fs.mkdir(path.join(dir, 'pkg', 'agent'), { recursive: true })
    // The agent's skills come as hq gives them: installed for the agent, their content in the site's package cache.
    process.env.SITE_ROOT = path.join(dir, 'site')
    skills = installedOnly(await cacheInstalledSkills({
      'hello-claude': { 'SKILL.md': `---\nname: hello-claude\ndescription: Greets the user the Agenthix way.\n---\n\n${INSTRUCTIONS}\n` },
      // A command hook while the skill is active, and an inline command in its body.
      'shell-probe': {
        'SKILL.md': [
          '---', 'name: shell-probe', 'description: Probes what a skill can run.', 'hooks:', '  PreToolUse:', '    - matcher: "Read"', '      hooks:',
          '        - type: command', '          command: "id > /tmp/hook-ran"', '---', '',
          PROBE_INSTRUCTIONS, 'Inline: !`echo INLINE-RAN-$((6*7))`', '',
        ].join('\n'),
      },
    }))

    standin = spawn('node', [fileURLToPath(new URL('./fixtures/standinAnthropic.mjs', import.meta.url))], {
      env: { ...process.env, PORT: '0', HOST: '0.0.0.0', LOG: path.join(dir, 'anthropic.jsonl'), BODY_LOG: path.join(dir, 'bodies.jsonl') },
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    port = await new Promise<string>((resolve, reject) => {
      standin!.stdout!.once('data', (d: Buffer) => resolve(d.toString().trim()))
      standin!.once('exit', () => reject(new Error('the stand-in Anthropic API exited')))
    })
    await docker('rm', '-f', CONTAINER).catch(() => '')
    await fs.mkdir(path.join(dir, 'run-staging', 'skills'), { recursive: true })
    await fs.mkdir(path.join(dir, 'run-staging', 'pinned-memory'), { recursive: true })
    await docker('run', '-d', '--init', '--memory', '2g', '--cpus', '2', '--pids-limit', '4096', '--name', CONTAINER,
      '--add-host', 'host.docker.internal:host-gateway',
      '-v', `${path.join(dir, 'home')}:/home/appuser`, '-v', `${path.join(dir, 'project')}:/projects/p1`,
      '-v', `${path.join(dir, 'run-staging')}:/run/staging:ro`,
      IMAGE, 'tail', '-f', '/dev/null')
  }, 120_000)

  afterAll(async () => {
    await runtime.endConversation({ sessionId, containerName: CONTAINER }).catch(() => {})
    await docker('rm', '-f', CONTAINER).catch(() => '')
    standin?.kill()
    if (siteRootBefore === undefined) delete process.env.SITE_ROOT
    else process.env.SITE_ROOT = siteRootBefore
    await fs.rm(dir, { recursive: true, force: true })
  }, 60_000)

  it.each([
    ['a bypassed agent', {}],
    ['a restricted agent', restricted],
    ['a restricted agent with no approved manifest', { ...restricted, approvedManifest: undefined }],
  ])('gives %s the Skill tool and shows it the staged skills, and only those', async (_label, overrides) => {
    const { sent } = await turn('TURN hello', { isNewSession: true, sessionId: randomUUID(), ...overrides })
    expect(sent.length).toBeGreaterThan(0)
    for (const request of sent) {
      expect(toolNames(request)).toContain('Skill')
      expect(listed(request).sort()).toEqual(['agenthix:agent-hello-claude', 'agenthix:agent-shell-probe'])
    }
    expect(text(sent[0]!)).toContain('agenthix:agent-hello-claude: Greets the user the Agenthix way.')
  }, 120_000)

  it("shows none of Claude Code's bundled skills when the run has none staged", async () => {
    const none = path.join(dir, 'pkg', 'none')
    const { sent } = await turn('TURN hello', {
      isNewSession: true, sessionId: randomUUID(), ...restricted,
      packages: { ...context().packages, agentDir: none, platformDir: none }, skills: null,
    })
    expect(sent.length).toBeGreaterThan(0)
    for (const request of sent) {
      expect(toolNames(request)).toContain('Skill')
      expect(text(request)).not.toContain('update-config')
    }
  }, 120_000)

  it("loads a staged skill's instructions by its name", async () => {
    const called = await turn('TURN DO:SKILL agent-hello-claude', { isNewSession: true, ...restricted })
    expect(results(called.events)).toEqual(['Launching skill: agent-hello-claude'])
    expect(text(called.sent.at(-1)!)).toContain(INSTRUCTIONS)
  }, 120_000)

  it('tells the model to load a skill the person picked, which then loads by its name (security review M7) @security-M7 @SC-1607', async () => {
    const picked = await turn('TURN DO:SKILL agent-hello-claude', { ...restricted, pickedSkill: 'agent-hello-claude' })
    expect(lastUserText(picked.sent[0]!)).toContain(asJson(pickedSkillInstruction('agent-hello-claude')))
    expect(results(picked.events)).toEqual(['Launching skill: agent-hello-claude'])
    expect(text(picked.sent.at(-1)!)).toContain(INSTRUCTIONS)

    const notStaged = await turn('TURN hello', { ...restricted, pickedSkill: 'agent-no-such-skill' })
    expect(lastUserText(notStaged.sent[0]!)).not.toContain('The person picked the skill')
  }, 120_000)

  it('tells the model to read the file of a picked skill it may not load itself, from the folder its process reads @SC-1607', async () => {
    const BY_HAND = 'BY-HAND-INSTRUCTIONS-8812'
    const byHand = {
      ...restricted,
      sessionId: randomUUID(),
      skills: installedOnly(await cacheInstalledSkills({
        'by-hand': { 'SKILL.md': `---\nname: by-hand\ndescription: Run only when a person picks it.\ndisable-model-invocation: true\n---\n\n${BY_HAND}\n` },
      })),
    }
    const picked = await turn('TURN hello', { ...byHand, isNewSession: true, pickedSkill: 'agent-by-hand' })
    const file = text(picked.sent[0]!).match(/Read the file (\S+?\/agent-by-hand\/SKILL\.md) first/)?.[1]
    expect(file).toMatch(/^\/run\/staging\/skills\/skills-[^/]+\/\.claude\/skills\/agent-by-hand\/SKILL\.md$/)
    expect(lastUserText(picked.sent[0]!)).toContain(asJson(pickedSkillReadInstruction('agent-by-hand', file!)))

    // The same skills keep the process, and with it the folder the instruction named: the read runs there.
    const read = await turn(`TURN DO:READ ${file}`, { ...byHand, pickedSkill: 'agent-by-hand' })
    expect(lastUserText(read.sent[0]!)).toContain(asJson(pickedSkillReadInstruction('agent-by-hand', file!)))
    expect(results(read.events)).toEqual([expect.stringContaining(BY_HAND)])
    await runtime.endConversation({ sessionId: byHand.sessionId, containerName: CONTAINER }).catch(() => {})
  }, 180_000)

  it.each([
    ['a staged skill', '/agent-hello-claude', INSTRUCTIONS],
    ['a skill the run has none of', '/no-such-skill', 'Unknown command'],
    // What each bundled command would put before the model, had it run.
    ["Claude Code's /init", '/init', 'Please analyze this codebase'],
    ["Claude Code's /compact", '/compact', 'Your task is to create a detailed summary'],
  ])("sends a typed /name for %s to the model as plain text, never running it @security-M7", async (_label, typed, neverSeen) => {
    const { events, sent } = await turn(`${typed} TURN`, restricted)
    expect(sent).toHaveLength(1)
    expect(text(sent[0]!)).toContain(PLAIN_TEXT_LINE.replaceAll('"', '\\"'))
    expect(lastUserText(sent[0]!)).not.toContain(neverSeen)
    expect(events.filter(e => e.type === 'text_delta')).toEqual([{ type: 'text_delta', textDelta: 'stand-in reply 0' }])
    expect(events.filter(e => e.type === 'compacted')).toEqual([])
  }, 120_000)

  it("refuses one of Claude Code's own bundled skills @SC-1607", async () => {
    const { events } = await turn('TURN DO:SKILL update-config', restricted)
    expect(results(events)).toEqual([expect.stringContaining('not in this session')])
  }, 60_000)

  it("loads a skill's instructions but neither runs its hook nor its inline command", async () => {
    const { events, sent } = await turn('TURN DO:SKILL agent-shell-probe')
    expect(results(events)).toEqual(['Launching skill: agent-shell-probe'])
    const loaded = text(sent.at(-1)!)
    expect(loaded).toContain(PROBE_INSTRUCTIONS)
    expect(loaded).not.toContain('INLINE-RAN-42')

    const read = await turn(`TURN DO:READ ${CWD}/x.txt`)
    expect(results(read.events)).toEqual([expect.stringContaining('x')])
    expect((await docker('exec', CONTAINER, 'sh', '-c', 'cat /tmp/hook-ran 2>/dev/null || echo no-hook')).trim()).toBe('no-hook')
  }, 120_000)
})
