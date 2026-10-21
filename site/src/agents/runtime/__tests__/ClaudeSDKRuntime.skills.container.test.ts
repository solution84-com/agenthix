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
    const skill = async (slug: string, md: string) => {
      await fs.mkdir(path.join(dir, 'pkg', 'agent', 'skills', slug), { recursive: true })
      await fs.writeFile(path.join(dir, 'pkg', 'agent', 'skills', slug, 'SKILL.md'), md)
    }
    await skill('hello-claude', `---\nname: hello-claude\ndescription: Greets the user the Agenthix way.\n---\n\n${INSTRUCTIONS}\n`)
    // A command hook while the skill is active, and an inline command in its body.
    await skill('shell-probe', [
      '---', 'name: shell-probe', 'description: Probes what a skill can run.', 'hooks:', '  PreToolUse:', '    - matcher: "Read"', '      hooks:',
      '        - type: command', '          command: "id > /tmp/hook-ran"', '---', '',
      PROBE_INSTRUCTIONS, 'Inline: !`echo INLINE-RAN-$((6*7))`', '',
    ].join('\n'))

    standin = spawn('node', [fileURLToPath(new URL('./fixtures/standinAnthropic.mjs', import.meta.url))], {
      env: { ...process.env, PORT: '0', LOG: path.join(dir, 'anthropic.jsonl'), BODY_LOG: path.join(dir, 'bodies.jsonl') },
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    port = await new Promise<string>((resolve, reject) => {
      standin!.stdout!.once('data', (d: Buffer) => resolve(d.toString().trim()))
      standin!.once('exit', () => reject(new Error('the stand-in Anthropic API exited')))
    })
    await docker('rm', '-f', CONTAINER).catch(() => '')
    await docker('run', '-d', '--init', '--memory', '2g', '--cpus', '2', '--pids-limit', '4096', '--name', CONTAINER,
      '--add-host', 'host.docker.internal:host-gateway',
      '-v', `${path.join(dir, 'home')}:/home/appuser`, '-v', `${path.join(dir, 'project')}:/projects/p1`,
      IMAGE, 'tail', '-f', '/dev/null')
  }, 120_000)

  afterAll(async () => {
    await runtime.endConversation({ sessionId, containerName: CONTAINER }).catch(() => {})
    await docker('rm', '-f', CONTAINER).catch(() => '')
    standin?.kill()
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
      packages: { ...context().packages, agentDir: none, platformDir: none },
    })
    expect(sent.length).toBeGreaterThan(0)
    for (const request of sent) {
      expect(toolNames(request)).toContain('Skill')
      expect(text(request)).not.toContain('update-config')
    }
  }, 120_000)

  it("loads a staged skill's instructions by its name, and by a person's /name", async () => {
    const called = await turn('TURN DO:SKILL agent-hello-claude', { isNewSession: true, ...restricted })
    expect(results(called.events)).toEqual(['Launching skill: agent-hello-claude'])
    expect(text(called.sent.at(-1)!)).toContain(INSTRUCTIONS)

    const typed = await turn('/agent-hello-claude', restricted)
    expect(typed.sent).toHaveLength(1)
    expect(text(typed.sent[0]!)).toContain(INSTRUCTIONS)
  }, 120_000)

  it('says so when a person types a /name the run has no skill for, instead of ending silently', async () => {
    const { events, sent } = await turn('/no-such-skill', restricted)
    expect(sent).toHaveLength(0)
    expect(events.filter(e => e.type === 'text_delta')).toEqual([{ type: 'text_delta', textDelta: 'Unknown command: /no-such-skill' }])
    expect(events.find(e => e.type === 'status')).toMatchObject({ status: 'completed' })
  }, 60_000)

  it("refuses one of Claude Code's own bundled skills", async () => {
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
