/**
 * The Claude runtime against a real `claude` process in the agent image, with
 * a stand-in for the Anthropic API — never a real model.
 *
 * Run with `npm run test:container` from site/ (vitest.container.config.ts).
 * It needs Docker and the agent image (AGENT_IMAGE,
 * `agenthix-agent:latest` by default), and is skipped when either is missing.
 *
 * One container (AGENT_CLAUDE_TEST_CONTAINER), capped at 2 GB and 2 CPUs, on
 * an agent network of its own, named as the site names it, removed at the end
 * with its network. The site's real key-ticket route and model relay are
 * served here, on this machine, which the container reaches through
 * host.docker.internal; the relay's source check is the real one. The
 * network's addresses are outside the agents' range (10.213.0.0/16): a host
 * service installed on this machine shuts the machine to that range, as its
 * agent protections do, where a deployed site shares its agents' network. The
 * stand-in Anthropic API runs here too, reached only through the relay, which
 * adds the key: the process only ever holds a relay token. Everything else the
 * container would send outside goes to a proxy that does not exist.
 */
import { execFile, spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import fs from 'node:fs/promises'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import express from 'express'

vi.mock('#db', () => ({ prisma: { toolCallLog: { create: vi.fn().mockResolvedValue({}) } } }))
// The gate's path check, which a test can switch to allow every path: a link
// swapped in after the check is the case left to what the tool itself runs.
const pathCheck = vi.hoisted(() => ({ allowEveryPath: false }))
vi.mock('../harnessPathRule', async importOriginal => {
  const real = await importOriginal<typeof import('../harnessPathRule')>()
  return {
    ...real,
    resolveHarnessPaths: (...args: Parameters<typeof real.resolveHarnessPaths>) =>
      pathCheck.allowEveryPath ? Promise.resolve({ realPaths: {} }) : real.resolveHarnessPaths(...args),
  }
})

// Anthropic's upstream is the stand-in's address on this machine; every other rule is the relay's own.
const upstream = vi.hoisted(() => ({ anthropic: '' }))
vi.mock('../../../server/modelRelay/relayProviders', async importOriginal => {
  const real = await importOriginal<typeof import('../../../server/modelRelay/relayProviders')>()
  return { ...real, upstreamBase: (c: Parameters<typeof real.upstreamBase>[0]) => (c.provider === 'anthropic' ? upstream.anthropic : real.upstreamBase(c)) }
})

import { ClaudeSDKRuntime } from '../ClaudeSDKRuntime'
import { claudeProcessMemoryMb } from '../claude/claudeProcessProbe'
import { CLAUDE_KEY_PATH } from '../../../server/runtime/claudeKeyTickets'
import { claudeKeyHandler } from '../../../server/runtime/claudeKeyApi'
import { modelRelayHandler } from '../../../server/modelRelay/modelRelayApi'
import { agentNetworkName } from '../containerNetwork'
import type { RunContext, RunEvent } from '../types'
import { claudeTestContext } from './claudeTestContext'

const run = promisify(execFile)
const IMAGE = process.env.AGENT_IMAGE ?? 'agenthix-agent:latest'
const enabled = spawnSync('docker', ['image', 'inspect', IMAGE], { stdio: 'ignore' }).status === 0
const CONTAINER = process.env.AGENT_CLAUDE_TEST_CONTAINER ?? 'ovi-lane4-claude-test'
const NETWORK = agentNetworkName(CONTAINER)
const CWD = '/projects/p1/files'
const KEY = 'sk-standin-lane4'

let dir: string
let siteServer: http.Server
let standin: ChildProcess | undefined
let keyRequests = 0
const relayed: Array<{ method: string; url: string; status: number }> = []
const runtime = new ClaudeSDKRuntime()
const sessionId = randomUUID()

const docker = async (...args: string[]) => (await run('docker', args, { timeout: 60_000 })).stdout
const inContainer = (script: string) => docker('exec', '-u', 'appuser', CONTAINER, 'sh', '-c', script)

function context(overrides: Partial<RunContext> = {}): RunContext {
  return claudeTestContext({
    runId: randomUUID(),
    sessionId,
    cwd: CWD,
    model: 'claude-sonnet-4-5',
    bypassed: true,
    isNewSession: false,
    containerName: CONTAINER,
    credential: { kind: 'apiKey', provider: 'anthropic', apiKey: KEY },
    claudeHome: { serverDir: path.join(dir, 'home', '.claude'), visibleDir: '/home/appuser/.claude' },
    // Not what a real run's git helper carries: the way this test gives the
    // process the stand-in's address and keeps anything else from leaving.
    gitCredEnv: {
      HTTPS_PROXY: 'http://127.0.0.1:9', HTTP_PROXY: 'http://127.0.0.1:9', NO_PROXY: '127.0.0.1,localhost,host.docker.internal',
      DISABLE_AUTOUPDATER: '1', CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
    },
    ...overrides,
  })
}

async function turn(prompt: string, overrides: Partial<RunContext> = {}): Promise<RunEvent[]> {
  const events: RunEvent[] = []
  for await (const e of runtime.run(context({ prompt, ...overrides }))) events.push(e)
  return events
}

const results = (events: RunEvent[]) => events.flatMap(e => e.type === 'tool_result' ? [e.output] : [])
const status = (events: RunEvent[]) => events.find(e => e.type === 'status')
const claudeCount = async () => Number((await inContainer(`pgrep -x claude | wc -l`)).trim())
const standinLog = async () => (await fs.readFile(path.join(dir, 'anthropic.jsonl'), 'utf8').catch(() => ''))
  .trim().split('\n').filter(Boolean).map(l => JSON.parse(l) as { model: string; xApiKey: string | null; plan: string })

describe.skipIf(!enabled)('a real claude process per conversation, in the agent image', () => {
  beforeAll(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ovi-lane4-'))
    await fs.mkdir(path.join(dir, 'home', '.claude'), { recursive: true })
    await fs.writeFile(path.join(dir, 'home', '.claude.json'), '{}')
    await fs.mkdir(path.join(dir, 'project', 'files'), { recursive: true })
    // The stand-in Anthropic API, on this machine, outside everything the container sees: its log holds the key it was sent.
    standin = spawn('node', [fileURLToPath(new URL('./fixtures/standinAnthropic.mjs', import.meta.url))], {
      env: { ...process.env, PORT: '0', LOG: path.join(dir, 'anthropic.jsonl') }, stdio: ['ignore', 'pipe', 'ignore'],
    })
    upstream.anthropic = `http://127.0.0.1:${await new Promise<string>((resolve, reject) => {
      standin!.stdout!.once('data', (d: Buffer) => resolve(d.toString().trim()))
      standin!.once('exit', () => reject(new Error('the stand-in Anthropic API exited')))
    })}`

    // The site's key-ticket route and model relay, mounted as main.ts mounts them.
    const app = express()
    app.post(CLAUDE_KEY_PATH, (req, res) => { keyRequests++; claudeKeyHandler(req as never, res as never) })
    app.all('/api/v1/model-relay/:provider{/*rest}', (req, res) => {
      res.on('finish', () => relayed.push({ method: req.method, url: req.originalUrl, status: res.statusCode }))
      void modelRelayHandler(req as never, res as never)
    })
    siteServer = http.createServer(app)
    await new Promise<void>(resolve => siteServer.listen(0, '0.0.0.0', resolve))
    process.env.SITE_AGENT_URL = `http://host.docker.internal:${(siteServer.address() as { port: number }).port}`

    await docker('rm', '-f', CONTAINER).catch(() => '')
    await docker('network', 'rm', NETWORK).catch(() => '')
    await docker('network', 'create', '--driver', 'bridge', '--subnet', '10.214.251.0/29', NETWORK)
    await docker('run', '-d', '--init', '--memory', '2g', '--cpus', '2', '--pids-limit', '4096', '--name', CONTAINER,
      '--network', NETWORK, '--add-host', 'host.docker.internal:host-gateway',
      '-v', `${path.join(dir, 'home')}:/home/appuser`, '-v', `${path.join(dir, 'project')}:/projects/p1`,
      IMAGE, 'tail', '-f', '/dev/null')
  }, 120_000)

  afterAll(async () => {
    await runtime.endConversation({ sessionId, containerName: CONTAINER }).catch(() => {})
    await docker('rm', '-f', CONTAINER).catch(() => '')
    await docker('network', 'rm', NETWORK).catch(() => '')
    siteServer?.closeAllConnections()
    await new Promise<void>(resolve => siteServer ? siteServer.close(() => resolve()) : resolve())
    standin?.kill()
    await fs.rm(dir, { recursive: true, force: true })
  }, 60_000)

  it('runs two turns in one process, which a command can neither read, signal, trace nor reach the home of', async () => {
    const probe = [
      'echo TAG=$SITE_SESSION',
      "env | grep -E '^(SITE_HARNESS_KEY|ANTHROPIC_API_KEY)=' || echo no-secrets",
      'p=$(pgrep -x claude | head -1)',
      'cat /proc/$p/environ >/dev/null 2>&1 && echo environ-read || echo environ-denied',
      'head -c1 /proc/$p/mem >/dev/null 2>&1 && echo mem-read || echo mem-denied',
      'kill -0 $p 2>/dev/null && echo signal-sent || echo signal-denied',
      'ls /home/appuser/.claude >/dev/null 2>&1 && echo home-read || echo home-denied',
    ].join('; ')
    const first = await turn(`TURN 1 DO:BASH ${probe}`, { isNewSession: true })
    const second = await turn('TURN 2 hello')

    expect(status(first)).toMatchObject({ status: 'completed' })
    expect(status(second)).toMatchObject({ status: 'completed' })
    const out = results(first).join('\n')
    expect(out).toContain(`TAG=${sessionId}`)
    for (const line of ['no-secrets', 'environ-denied', 'mem-denied', 'signal-denied', 'home-denied']) expect(out).toContain(line)
    expect(await claudeCount()).toBe(1)
    // One ticket trade for the process; every model request went through the
    // relay, and reached the model with the key the relay added. Token counts
    // (`/v1/messages/count_tokens`) go through the relay too, but are no model
    // request, and the stand-in does not log them.
    expect(keyRequests).toBe(1)
    const messages = relayed.filter(r => r.url.split('?')[0] === '/api/v1/model-relay/anthropic/v1/messages')
    expect(messages.length).toBeGreaterThan(0)
    expect(messages.every(r => r.status === 200)).toBe(true)
    const log = await standinLog()
    expect(log.length).toBeGreaterThanOrEqual(messages.length)
    expect(log.every(r => r.xApiKey === KEY)).toBe(true)
  }, 120_000)

  it('holds no API key anywhere in the container during a turn: the relay adds it on the way out', async () => {
    const slowBefore = (await standinLog()).filter(r => r.plan === 'slow').length
    const controller = new AbortController()
    const running = turn('TURN 3b DO:SLOW', { abortSignal: controller.signal })
    const deadline = Date.now() + 30_000
    while ((await standinLog()).filter(r => r.plan === 'slow').length === slowBefore) {
      if (Date.now() > deadline) throw new Error('timed out waiting for the turn to reach the model')
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    // As the harness's own user, outside any command's sandbox: the home, and
    // every process's environment and command line. The key is given to grep
    // in a file, so the scan's own command lines do not carry it.
    const scan = await inContainer([
      `echo ${Buffer.from(KEY).toString('base64')} | base64 -d > /tmp/key-pattern`,
      'grep -r -l -a -F -f /tmp/key-pattern /home/appuser 2>/dev/null',
      'for f in /proc/[0-9]*/environ /proc/[0-9]*/cmdline; do grep -l -a -F -f /tmp/key-pattern "$f" 2>/dev/null; done',
      // The scan can read the process's environment: it finds the relay there.
      'grep -c -a -F model-relay/anthropic /proc/$(pgrep -x claude | head -1)/environ',
      'echo scanned',
    ].join('\n')).catch(err => { controller.abort(); throw err })
    controller.abort()
    await running

    expect(scan.trim().split('\n')).toEqual(['1', 'scanned'])
    expect(await docker('inspect', '--format', '{{json .Config.Env}}', CONTAINER)).not.toContain(KEY)
    // The relay knew the request came from this container's machine, and only a relay token: the model had the key.
    expect(relayed.some(r => r.status === 401 || r.status === 403)).toBe(false)
    expect((await standinLog()).at(-1)?.xApiKey).toBe(KEY)
  }, 60_000)

  it('records the model the process reports, not a retired id it renamed', async () => {
    const events = await turn('TURN 3 hello', { model: 'claude-opus-4-1' })
    const reported = (status(events) as { model?: string }).model
    expect(reported).toBeTruthy()
    expect(reported).not.toBe('claude-opus-4-1')
    expect((await standinLog()).at(-1)?.model).toBe(reported)
    expect(await claudeCount()).toBe(1)
  }, 60_000)

  it('stops a cancelled turn and keeps the process; a late cancel changes nothing', async () => {
    const controller = new AbortController()
    setTimeout(() => controller.abort(), 1500)
    const started = Date.now()
    await turn('TURN 4 DO:SLOW', { abortSignal: controller.signal })
    expect(Date.now() - started).toBeLessThan(10_000)

    const late = new AbortController()
    const next = await turn('TURN 5 hello', { abortSignal: late.signal })
    late.abort()
    expect(status(next)).toMatchObject({ status: 'completed' })
    expect(await claudeCount()).toBe(1)
    expect(keyRequests).toBe(1)
  }, 60_000)

  it("lets Claude's read-only tools read its saved large tool results, and nothing else in the home", async () => {
    const big = await turn('TURN 6 DO:BIGREAD')
    const [saved, read] = results(big)
    expect(saved).toMatch(new RegExp(`saved to: /home/appuser/\\.claude/projects/-projects-p1-files/${sessionId}/tool-results/\\S+\\.txt`))
    expect(read).toContain('aaaa')

    const denied = await turn('TURN 7 DO:READ /home/appuser/.claude.json')
    expect(results(denied).join('\n')).not.toContain('{}')
  }, 60_000)

  it('reads the process memory, and replaces the process when its tools change', async () => {
    expect(await claudeProcessMemoryMb({ containerName: CONTAINER, conversationId: sessionId })).toBeGreaterThan(50)
    const before = (await inContainer('pgrep -x claude')).trim()
    await turn('TURN 8 hello', { bypassed: false, allowedTools: [{ name: 'read_file', state: 'always' }] })
    const after = (await inContainer('pgrep -x claude')).trim()

    expect(after).not.toBe(before)
    expect(await claudeCount()).toBe(1)
    expect(keyRequests).toBe(2)
  }, 60_000)

  it('ends the process when the conversation goes idle, and the next turn resumes', async () => {
    await runtime.conversationIdle({ sessionId, containerName: CONTAINER })
    expect(await claudeCount()).toBe(0)

    const resumed = await turn('TURN 9 hello')
    expect(status(resumed)).toMatchObject({ status: 'completed' })
    expect(await claudeCount()).toBe(1)
  }, 60_000)

  it("runs Grep and Glob's rg contained: a link into the harness home or to /proc/self leads nowhere, the project searches as before", async () => {
    await fs.writeFile(path.join(dir, 'home', 'secret.txt'), 'HARNESS-HOME-SECRET\n')
    await fs.writeFile(path.join(dir, 'project', 'files', 'notes.txt'), 'The codeword is PERSIMMON-42.\n')
    await inContainer(`cd ${CWD} && ln -sfn /home/appuser to-home && ln -sfn /proc/self to-proc`)
    // The harness's own permissions reach the home: the real rg, run as the harness, finds the secret.
    expect(await inContainer(`/usr/bin/rg -l HARNESS-HOME-SECRET ${CWD}/to-home/`)).toContain('secret.txt')

    pathCheck.allowEveryPath = true
    try {
      const out = async (prompt: string) => results(await turn(prompt)).join('\n')
      const homeGrep = await out(`TURN 10 DO:GREP HARNESS-HOME-SECRET ${CWD}/to-home`)
      const homeGlob = await out(`TURN 11 DO:GLOB **/secret.txt ${CWD}/to-home`)
      const procGrep = await out(`TURN 12 DO:GREP SITE_HARNESS_KEY ${CWD}/to-proc`)
      const projectGrep = await out(`TURN 13 DO:GREP PERSIMMON ${CWD}`)
      const projectGlob = await out(`TURN 14 DO:GLOB *.txt ${CWD}`)
      for (const text of [homeGrep, homeGlob, procGrep]) {
        expect(text).not.toContain('HARNESS-HOME-SECRET')
        expect(text).not.toContain('secret.txt')
        expect(text).not.toMatch(/SITE_HARNESS_KEY=\S/)
        expect(text).not.toContain(KEY)
      }
      expect(projectGrep).toBe('notes.txt:1:The codeword is PERSIMMON-42.')
      expect(projectGlob).toBe('notes.txt')
    } finally {
      pathCheck.allowEveryPath = false
      await inContainer(`rm -f ${CWD}/to-home ${CWD}/to-proc`)
    }
  }, 120_000)
})
