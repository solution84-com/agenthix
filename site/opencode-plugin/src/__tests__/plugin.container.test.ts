/**
 * Agenthix's OpenCode plugin in a real OpenCode server, in the agent image,
 * against a stand-in model and a stand-in site inside the container — never a
 * real model, and no network.
 *
 * Run with `npm run test:container` from site/ (vitest.container.config.ts).
 * It needs Docker and an agent image holding this plugin (AGENT_IMAGE,
 * `agenthix-agent:latest` by default), and is skipped when either is missing.
 *
 * One container, capped at 2 GB and 2 CPUs, removed at the end.
 */
import { execFile, spawnSync } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { HARNESS_GATE_UNAVAILABLE } from '@agenthix/core'
import {
  HARNESS_SECRET_ENV, OPENCODE_COMMAND_SHELL, OPENCODE_MODELS_FILE, OPENCODE_PLUGIN_URL,
} from '../../../src/agents/runtime/agentImage'
// Staging records what a run used on its row; this test has no database.
vi.mock('#db', () => ({ prisma: { agentRun: { update: vi.fn().mockResolvedValue({}) } } }))

import { stageOpenCodeSkills } from '../../../src/agents/runtime/opencode/openCodeSkills'
import { cacheInstalledSkills, installedOnly } from '../../../src/agents/runtime/__tests__/installedSkillFixture'
import { APPLY_PATCH_DESCRIPTION, EDIT_DESCRIPTION, READ_DESCRIPTION, SKILL_DESCRIPTION, WRITE_DESCRIPTION } from '../files/descriptions'

const exec = promisify(execFile)
const IMAGE = process.env.AGENT_IMAGE ?? 'agenthix-agent:latest'
const enabled = spawnSync('docker', ['image', 'inspect', IMAGE], { stdio: 'ignore' }).status === 0
const C = 'ovi-lane3-plugin-test'
const PASSWORD = 'pw-lane3'
const SERVER_KEY = 'server-key-lane3'
const PLACEHOLDER = 'agenthix-placeholder'
const SECRET = 'TOPSECRET-harness-home'

let dir: string

const docker = async (args: string[], timeout = 120_000) => (await exec('docker', args, { timeout, maxBuffer: 64 * 1024 * 1024 })).stdout
const sh = (script: string) => docker(['exec', C, 'sh', '-c', script])
async function driver<T>(op: string, arg?: unknown, timeout = 300_000): Promise<T> {
  const out = await docker(['exec', '-e', `OPENCODE_SERVER_PASSWORD=${PASSWORD}`, C, 'node', '/f/driver.mjs', op, ...(arg ? [JSON.stringify(arg)] : [])], timeout)
  return JSON.parse(out) as T
}

type ToolPart = { tool: string; status: string; input: Record<string, unknown>; output?: string; error?: string }
type Turn = { status: number; final: string | null; errors: unknown[]; tools: ToolPart[] }
type ModelRequest = { n: number; url: string; authorization: string | null; xApiKey: string | null; xGoogApiKey: string | null; system: string; tools: { name: string; description: string }[] }
type Decision = { sessionId: string; callId: string; tool: string; decision: string; message?: string }

const lines = async <T>(file: string): Promise<T[]> =>
  (await fs.readFile(path.join(dir, 'fixtures', 'logs', file), 'utf8').catch(() => '')).trim().split('\n').filter(Boolean).map(l => JSON.parse(l) as T)
const modelLog = () => lines<ModelRequest>('model.jsonl')
const siteLog = () => lines<Decision>('site.jsonl')

const session = (conversationId: string, headers: Record<string, string> = { Authorization: `Bearer key-${conversationId}` }) =>
  driver<{ sessionId: string }>('session', { conversationId, headers }).then(r => r.sessionId)
const turn = (sessionId: string, steps: unknown[][], extra: Record<string, unknown> = {}) => driver<Turn>('turn', { sessionId, steps, ...extra })
const bash = (command: string) => ({ name: 'bash', args: { command, description: 'x' } })
const read = (filePath: string) => ({ name: 'read', args: { filePath } })
/** OpenCode offers apply_patch, in place of edit and write, to a model whose id says GPT (tool/registry.ts). */
const GPT = { providerID: 'standin', modelID: 'gpt-5-standin' }
const applyPatch = (lines: string[], before: string[] = []) =>
  ({ name: 'apply_patch', args: { patchText: [...before, '*** Begin Patch', ...lines, '*** End Patch'].join('\n') } })

function providerConfig(withKeys: boolean) {
  const key = withKeys ? { apiKey: PLACEHOLDER } : {}
  return {
    standin: {
      npm: '@ai-sdk/openai-compatible', name: 'Standin',
      options: { baseURL: 'http://127.0.0.1:9100/standin/v1', apiKey: PLACEHOLDER },
      models: {
        m1: { name: 'm1', tool_call: true, limit: { context: 100000, output: 4000 } },
        [GPT.modelID]: { name: GPT.modelID, tool_call: true, limit: { context: 100000, output: 4000 } },
      },
    },
    openrouter: { options: { baseURL: 'http://127.0.0.1:9100/openrouter/v1', ...key } },
    openai: { options: { baseURL: 'http://127.0.0.1:9100/openai/v1', ...key } },
    anthropic: { options: { baseURL: 'http://127.0.0.1:9100/anthropic/v1', ...key } },
    google: { options: { baseURL: 'http://127.0.0.1:9100/google/v1beta', ...key } },
  }
}

async function startServer(label: string, withKeys: boolean) {
  await sh(`pkill -f "[o]pencode serve" ; sleep 1; true`)
  const config = {
    model: 'standin/m1',
    provider: providerConfig(withKeys),
    enabled_providers: ['standin', 'openrouter', 'openai', 'anthropic', 'google'],
    permission: { '*': 'allow', task: 'deny', question: 'deny', skill: 'deny' },
    plugin: [OPENCODE_PLUGIN_URL],
    shell: OPENCODE_COMMAND_SHELL,
    share: 'disabled',
    autoupdate: false,
  }
  const env = {
    OPENCODE_DISABLE_DEFAULT_PLUGINS: '1', OPENCODE_DISABLE_EXTERNAL_SKILLS: '1', OPENCODE_DISABLE_CLAUDE_CODE: '1',
    OPENCODE_DISABLE_LSP_DOWNLOAD: '1', OPENCODE_DISABLE_AUTOUPDATE: '1', OPENCODE_DISABLE_PROJECT_CONFIG: '1',
    OPENCODE_DISABLE_MODELS_FETCH: '1', OPENCODE_DISABLE_SHARE: '1',
    npm_config_offline: 'true', OPENCODE_AUTH_CONTENT: '{}', OPENCODE_MODELS_PATH: OPENCODE_MODELS_FILE,
    OPENCODE_SERVER_PASSWORD: PASSWORD, SITE_HARNESS_KEY: SERVER_KEY, EXA_API_KEY: 'exa-must-not-reach-commands',
    OPENCODE_CONFIG_CONTENT: JSON.stringify(config),
    SITE_PLUGIN_CONFIG: JSON.stringify({
      siteUrl: 'http://127.0.0.1:9400', gateTimeoutMs: 3000, turnTimeoutMs: 3000,
      secretEnv: [...HARNESS_SECRET_ENV], commandEnv: { npm_config_offline: 'false' },
    }),
  }
  await fs.writeFile(path.join(dir, 'fixtures', 'server-env.json'), JSON.stringify(env))
  await docker(['exec', '-d', C, 'node', '/f/start.mjs', label])
  expect(await driver<{ ready: boolean }>('ready')).toEqual({ ready: true })
}

const siteRootBefore = process.env.SITE_ROOT

/** Each agent's skills, as hq gives them: installed for the agent, their content in the site's package cache. */
const agentSkills = new Map<string, Record<string, Record<string, string>>>()

async function stageFor(conversationId: string, agentPkg: string) {
  return stageOpenCodeSkills({
    runId: `run-${conversationId}`,
    claudeHome: { serverDir: path.join(dir, 'home', '.claude'), visibleDir: '/home/appuser/.claude' },
    skills: installedOnly(await cacheInstalledSkills(agentSkills.get(agentPkg) ?? {})),
  }, conversationId)
}

async function writeSkill(agentPkg: string, slug: string, description: string, body: string) {
  const skills = agentSkills.get(agentPkg) ?? {}
  skills[slug] = { 'SKILL.md': `---\nname: ${slug}\ndescription: ${description}\n---\n\n${body}\n` }
  agentSkills.set(agentPkg, skills)
}

describe.skipIf(!enabled)("Agenthix's plugin in a real OpenCode server", () => {
  beforeAll(async () => {
    dir = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'ovi-lane3-')))
    process.env.SITE_ROOT = path.join(dir, 'site')
    for (const d of ['home/.claude/.tmp', 'home/.config/opencode', 'home/.opencode', 'oc-config', 'fixtures/logs', 'packages/platform/skills']) {
      await fs.mkdir(path.join(dir, d), { recursive: true })
    }
    await fs.writeFile(path.join(dir, 'home', 'secret.txt'), SECRET)
    await fs.writeFile(path.join(dir, 'home', '.claude.json'), '{}')
    await fs.writeFile(path.join(dir, 'oc-config', '.gitignore'), '*\n')
    for (const f of ['standinModel.mjs', 'standinSite.mjs', 'driver.mjs', 'start.mjs', 'flipper.mjs']) {
      await fs.copyFile(new URL(`./fixtures/${f}`, import.meta.url), path.join(dir, 'fixtures', f))
    }
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
    await sh('mkdir -p /projects/p1/files && printf "harmless\\n" > /projects/p1/files/race')
    await docker(['exec', '-d', C, 'node', '/f/standinModel.mjs'])
    await docker(['exec', '-d', '-e', `SERVER_KEY=${SERVER_KEY}`, C, 'node', '/f/standinSite.mjs'])
    await startServer('keys', true)
  }, 180_000)

  afterAll(async () => {
    if (!enabled) return
    if (siteRootBefore === undefined) delete process.env.SITE_ROOT
    else process.env.SITE_ROOT = siteRootBefore
    await docker(['rm', '-f', C]).catch(() => '')
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {})
  }, 60_000)

  it("offers the model the plugin's read, write, edit and skill in OpenCode's words, and none of OpenCode's own skills", async () => {
    const id = await session('conv-list')
    await turn(id, [])
    const req = (await modelLog()).at(-1) as ModelRequest
    const byName = (name: string) => req.tools.filter(t => t.name === name)
    expect(byName('read')).toEqual([{ name: 'read', description: READ_DESCRIPTION }])
    expect(byName('write')).toEqual([{ name: 'write', description: WRITE_DESCRIPTION }])
    expect(byName('edit')).toEqual([{ name: 'edit', description: EDIT_DESCRIPTION }])
    expect(byName('skill')).toEqual([{ name: 'skill', description: SKILL_DESCRIPTION }])
    expect(req.tools.map(t => t.name)).not.toContain('task')
    expect(req.tools.map(t => t.name)).not.toContain('question')
    expect(req.system).not.toContain('customize-opencode')
  }, 120_000)

  it("runs no tool call without the site's allow", async () => {
    const id = await session('conv-gate')
    const t = await turn(id, [
      [bash('touch /projects/p1/files/ran-ok.txt && echo ran')],
      [bash('touch /projects/p1/files/ran-DENY.txt')],
      [{ name: 'write', args: { filePath: '/projects/p1/files/w-DENY.txt', content: 'x' } }],
      [read('/home/appuser/secret.txt')],
      [{ name: 'todowrite', args: { todos: [{ content: 'a', status: 'pending', priority: 'low', id: '1' }] } }],
    ])
    expect(t.tools.map(p => [p.tool, p.status])).toEqual([
      ['bash', 'completed'], ['bash', 'error'], ['write', 'error'], ['read', 'error'], ['todowrite', 'completed'],
    ])
    expect(t.tools[1].error).toBe('Agenthix refuses bash here. Ask the person instead.')
    expect(t.tools[3].error).toBe('Agenthix refuses read of /home/appuser/secret.txt.')
    expect(await sh('ls /projects/p1/files')).not.toMatch(/DENY/)
    const decisions = (await siteLog()).filter(d => d.sessionId === id)
    expect(decisions.map(d => [d.tool, d.decision])).toEqual([
      ['bash', 'allow'], ['bash', 'refuse'], ['write', 'refuse'], ['read', 'refuse'], ['todowrite', 'allow'],
    ])

    await driver('noturn', { sessionId: id })
    const none = await turn(id, [[bash('touch /projects/p1/files/no-turn.txt')]])
    expect(none.tools[0]).toMatchObject({ tool: 'bash', status: 'error', error: HARNESS_GATE_UNAVAILABLE })

    const slow = await session('conv-slow')
    await driver('hang', { sessionId: slow })
    const started = Date.now()
    const hung = await turn(slow, [[bash('touch /projects/p1/files/hung.txt')]])
    expect(hung.tools[0]).toMatchObject({ tool: 'bash', status: 'error', error: HARNESS_GATE_UNAVAILABLE })
    expect(Date.now() - started).toBeLessThan(30_000)
    expect(await sh('ls /projects/p1/files')).not.toMatch(/no-turn|hung/)
  }, 180_000)

  it("gives each command its conversation's tag and staged skills, and none of the server's secrets", async () => {
    await writeSkill('agent-env', 'probe', 'A probe.', 'Probe body.')
    await stageFor('conv-env', 'agent-env')
    await stageFor('conv-other', 'agent-env')
    const id = await session('conv-env')
    const skills = (conv: string) => `/home/appuser/.claude/.tmp/conversation-${conv}/skills/agent-probe/SKILL.md`
    const t = await turn(id, [[bash(
      `env | sort; echo ---; cat ${skills('conv-env')}; echo ---; cat /home/appuser/secret.txt || echo SECRET-REFUSED; cat ${skills('conv-other')} || echo OTHER-REFUSED`,
    )]])
    const out = t.tools[0].output ?? ''
    expect(out).toContain('SITE_SESSION=conv-env')
    expect(out).toContain('npm_config_offline=false')
    expect(out).toContain('HOME=/home/agent')
    expect(out).toContain('Probe body.')
    expect(out).toContain('SECRET-REFUSED')
    expect(out).toContain('OTHER-REFUSED')
    expect(out.match(/Probe body\./g)).toHaveLength(1)
    for (const leak of [PASSWORD, SERVER_KEY, 'exa-must-not-reach-commands', SECRET, 'OPENCODE_CONFIG_CONTENT=']) expect(out).not.toContain(leak)
  }, 120_000)

  it('gives two conversations with a same-named skill each their own, shows an edit on the next turn, and never a planted one', async () => {
    await writeSkill('agent-1', 'deploy', 'Deploy, the first way.', 'Body of the FIRST deploy.')
    await writeSkill('agent-2', 'deploy', 'Deploy, the second way.', 'Body of the SECOND deploy.')
    await sh('mkdir -p /projects/p1/files/.opencode/skills/planted /projects/p1/files/.opencode/skill/planted2 && for d in skills/planted skill/planted2; do printf -- "---\\nname: $(basename $d)\\ndescription: planted\\n---\\nPLANTED\\n" > /projects/p1/files/.opencode/$d/SKILL.md; done')
    const a = await stageFor('conv-sa', 'agent-1')
    const b = await stageFor('conv-sb', 'agent-2')
    const sa = await session('conv-sa')
    const sb = await session('conv-sb')
    const load = (name: string) => [[{ name: 'skill', args: { name } }]]

    const ta = await turn(sa, load('agent-deploy'), { system: a.systemSection })
    const tb = await turn(sb, load('agent-deploy'), { system: b.systemSection })
    expect(ta.tools[0].output).toContain('Body of the FIRST deploy.')
    expect(tb.tools[0].output).toContain('Body of the SECOND deploy.')
    const systems = (await modelLog()).slice(-4).map(r => r.system)
    expect(systems.some(s => s.includes('<description>Deploy, the first way.</description>'))).toBe(true)
    expect(systems.join('\n')).not.toContain('planted')

    await writeSkill('agent-1', 'deploy', 'Deploy, the first way.', 'Body EDITED between turns.')
    const again = await stageFor('conv-sa', 'agent-1')
    expect((await turn(sa, load('agent-deploy'), { system: again.systemSection })).tools[0].output).toContain('Body EDITED between turns.')

    for (const name of ['planted', 'planted2']) {
      const t = await turn(sa, load(name), { system: again.systemSection })
      expect(t.tools[0]).toMatchObject({ status: 'error', error: 'Skill "' + name + '" not found. Available skills: agent-deploy' })
    }
  }, 240_000)

  it('never lets a link swapped in by a command lead a read into the harness home', async () => {
    await docker(['exec', '-d', '-e', 'DURATION=60000', '-e', 'MODE=file', C, '/usr/local/lib/agenthix/bin/agenthix-contain', '/usr/local/bin/node', '/f/flipper.mjs'])
    const id = await session('conv-race')
    const steps = Array.from({ length: 20 }, () => Array.from({ length: 10 }, () => read('/projects/p1/files/race')))
    const t = await turn(id, steps)
    const outputs = t.tools.map(p => `${p.output ?? ''}${p.error ?? ''}`)
    const completed = t.tools.filter(p => p.status === 'completed').length
    console.log(JSON.stringify({ raceRead: { calls: t.tools.length, completed } }))
    expect(t.tools).toHaveLength(200)
    expect(outputs.filter(o => o.includes(SECRET))).toEqual([])
    expect(completed).toBeGreaterThan(0)
  }, 240_000)

  it('never lets a folder swapped for a link lead a write or an edit into the harness home', async () => {
    await sh('mkdir -p /projects/p1/files/out')
    await docker(['exec', '-d', '-e', 'DURATION=60000', '-e', 'MODE=dir', C, '/usr/local/lib/agenthix/bin/agenthix-contain', '/usr/local/bin/node', '/f/flipper.mjs'])
    const id = await session('conv-race-w')
    const steps = Array.from({ length: 20 }, (_, i) => [
      { name: 'write', args: { filePath: '/projects/p1/files/out/planted.txt', content: `PWNED ${i}` } },
      { name: 'write', args: { filePath: '/projects/p1/files/out/secret.txt', content: `PWNED ${i}` } },
      { name: 'edit', args: { filePath: '/projects/p1/files/out/secret.txt', oldString: SECRET, newString: 'PWNED' } },
    ])
    const t = await turn(id, steps)
    const completed = t.tools.filter(p => p.status === 'completed').length
    console.log(JSON.stringify({ raceWrite: { calls: t.tools.length, completed } }))
    expect(t.tools).toHaveLength(60)
    expect(await fs.readFile(path.join(dir, 'home', 'secret.txt'), 'utf8')).toBe(SECRET)
    await expect(fs.access(path.join(dir, 'home', 'planted.txt'))).rejects.toThrow()
  }, 240_000)

  it("offers a GPT model the plugin's apply_patch in OpenCode's words, in place of edit and write, and applies a patch across files", async () => {
    await sh('mkdir -p /projects/p1/files/ap && cd /projects/p1/files/ap && printf "one\\ntwo\\n" > keep.txt && printf "x\\n" > old.txt && printf "bye\\n" > gone.txt')
    const id = await session('conv-patch')
    const t = await turn(id, [[applyPatch([
      '*** Add File: ap/new/hello.txt', '+Hello',
      '*** Update File: ap/keep.txt', '@@', '-two', '+TWO',
      '*** Update File: ap/old.txt', '*** Move to: ap/moved.txt', '@@', '-x', '+y',
      '*** Delete File: ap/gone.txt',
    ])]], { model: GPT })
    const req = (await modelLog()).filter(r => r.tools.length > 0).at(-1) as ModelRequest
    expect(req.tools.filter(tool => tool.name === 'apply_patch')).toEqual([{ name: 'apply_patch', description: APPLY_PATCH_DESCRIPTION }])
    expect(req.tools.map(tool => tool.name)).not.toContain('edit')
    expect(req.tools.map(tool => tool.name)).not.toContain('write')
    expect(t.tools.map(p => [p.tool, p.status])).toEqual([['apply_patch', 'completed']])
    const at = t.tools[0].output?.match(/\nA (.*)ap\/new\/hello\.txt/)?.[1] ?? ''
    expect(t.tools[0].output).toBe(`Success. Updated the following files:\nA ${at}ap/new/hello.txt\nM ${at}ap/keep.txt\nM ${at}ap/moved.txt\nD ${at}ap/gone.txt`)
    expect(await sh('cd /projects/p1/files/ap && cat new/hello.txt keep.txt moved.txt && ls')).toBe('Hello\none\nTWO\ny\nkeep.txt\nmoved.txt\nnew\n')
  }, 120_000)

  it('refuses a patch through a folder swapped for a link into the harness home or /proc after the check, and writes nothing there', async () => {
    await sh('printf "ok\\n" > /projects/p1/files/ok.txt')
    const id = await session('conv-patch-race')
    const swapped = (target: string, ...lines: string[]) => [applyPatch(lines, [`SWAPTO:${target}`])]
    const steps = [
      swapped('/home/appuser', '*** Add File: swap/planted.txt', '+PWNED'),
      swapped('/home/appuser', '*** Update File: swap/secret.txt', '@@', `-${SECRET}`, '+PWNED'),
      swapped('/home/appuser', '*** Delete File: swap/secret.txt'),
      swapped('/home/appuser', '*** Update File: ok.txt', '*** Move to: swap/moved.txt', '@@', '-ok', '+PWNED'),
      swapped('/proc/self', '*** Add File: swap/planted', '+PWNED'),
      swapped('/proc/self', '*** Update File: swap/environ', '@@', '-x', '+PWNED'),
    ]
    const t = await turn(id, steps, { model: GPT })
    expect(t.tools.map(p => [p.tool, p.status])).toEqual(steps.map(() => ['apply_patch', 'error']))
    for (const p of t.tools) expect(p.error).toContain('changed after it was checked, so it was not opened')
    expect((await siteLog()).filter(d => d.sessionId === id).map(d => d.decision)).toEqual(steps.map(() => 'allow'))
    expect(await fs.readFile(path.join(dir, 'home', 'secret.txt'), 'utf8')).toBe(SECRET)
    expect(await fs.readdir(path.join(dir, 'home'))).not.toEqual(expect.arrayContaining(['planted.txt']))
    expect(await fs.readdir(path.join(dir, 'home'))).not.toEqual(expect.arrayContaining(['moved.txt']))
    expect(await sh('cat /projects/p1/files/ok.txt')).toBe('ok\n')
  }, 180_000)

  it("puts each session's own key on its model requests, over the provider's own", async () => {
    const first = await session('conv-ka')
    const second = await session('conv-kb')
    const before = (await modelLog()).length
    await turn(first, [])
    const mid = (await modelLog()).length
    await turn(second, [])
    const all = await modelLog()
    expect(all.slice(before, mid).map(r => r.authorization)).toEqual(['Bearer key-conv-ka'])
    expect(all.slice(mid).map(r => r.authorization)).toEqual(['Bearer key-conv-kb'])
  }, 120_000)

  it("reaches each provider with the turn's key, whether or not the configuration holds a placeholder", async () => {
    const providers = [
      { providerID: 'openrouter', modelID: 'qwen/qwen3.8-27b:free', header: 'Authorization', value: 'Bearer real-openrouter', field: 'authorization' },
      { providerID: 'openai', modelID: 'gpt-4.1-mini', header: 'Authorization', value: 'Bearer real-openai', field: 'authorization' },
      { providerID: 'openai', modelID: 'gpt-4.1-mini', header: 'authorization', value: 'Bearer real-openai-lower', field: 'authorization' },
      { providerID: 'anthropic', modelID: 'claude-haiku-4-5', header: 'x-api-key', value: 'real-anthropic', field: 'xApiKey' },
      { providerID: 'google', modelID: 'gemini-2.5-flash', header: 'x-goog-api-key', value: 'real-google', field: 'xGoogApiKey' },
    ] as const
    const results: Record<string, unknown>[] = []
    for (const withKeys of [true, false]) {
      if (!withKeys) await startServer('nokeys', false)
      for (const p of providers) {
        const id = await session(`conv-${p.providerID}-${p.header}-${withKeys ? 'ph' : 'none'}`.toLowerCase().replaceAll('_', '-'), { [p.header]: p.value })
        const before = (await modelLog()).length
        const t = await turn(id, [], { model: { providerID: p.providerID, modelID: p.modelID } })
        const reqs = (await modelLog()).slice(before).filter(r => r.url.startsWith(`/${p.providerID}/`))
        results.push({ provider: p.providerID, placeholder: withKeys, requests: reqs.length, got: reqs.map(r => r[p.field]), errors: t.errors })
      }
    }
    console.log(JSON.stringify(results.map(({ errors, ...r }) => ({ ...r, error: (errors as { name: string }[])[0]?.name ?? null }))))
    for (const r of results.filter(r => r.placeholder)) {
      expect(r.requests).toBeGreaterThan(0)
      for (const got of r.got as string[]) expect(got).not.toContain(PLACEHOLDER)
    }
  }, 300_000)
})
