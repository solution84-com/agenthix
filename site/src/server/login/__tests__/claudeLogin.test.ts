import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { EventEmitter } from 'node:events'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { startLogin, finishLogin, cancelLogin, _resetForTests, type LoginDeps } from '../claudeLogin'

const URL_OUT = 'https://claude.ai/oauth/authorize?code=true&client_id=abc&state=SECRETSTATE'
const OAUTH = { claudeAiOauth: { accessToken: 'sk-ant-oat-AAA', refreshToken: 'sk-ant-ort-BBB', expiresAt: 1790000000000 } }

class FakeProc extends EventEmitter {
  stdout = new EventEmitter()
  stderr = new EventEmitter()
  writes: string[] = []
  stdin = Object.assign(new EventEmitter(), { write: (s: string) => { this.writes.push(s); return true }, end: vi.fn() })
  kill = vi.fn()
  say(text: string) { this.stdout.emit('data', Buffer.from(text)) }
  exit(code: number) { this.emit('exit', code, null) }
}

let procs: FakeProc[]
let spawnCalls: Array<{ cmd: string; args: string[] }>
let scratches: string[]
let removed: string[]
let kill: ReturnType<typeof vi.fn>
let deps: Partial<LoginDeps>
let networks: { ensured: string[]; released: string[]; fail: boolean }

beforeEach(() => {
  _resetForTests()
  procs = []
  spawnCalls = []
  scratches = []
  removed = []
  kill = vi.fn().mockResolvedValue(undefined)
  networks = { ensured: [], released: [], fail: false }
  deps = {
    network: {
      ensure: async (name: string) => {
        if (networks.fail) throw new Error('AGENT_NETWORK_RANGE has no free /29 left')
        networks.ensured.push(name)
        return `${name}-net`
      },
      release: (name: string) => { networks.released.push(name) },
    },
    image: 'agenthix-agent',
    spawn: ((cmd: string, args: string[]) => {
      spawnCalls.push({ cmd, args })
      const p = new FakeProc()
      procs.push(p)
      return p
    }) as unknown as LoginDeps['spawn'],
    mkScratch: async () => {
      const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'claude-login-test-'))
      scratches.push(dir)
      return dir
    },
    rmScratch: async (dir: string) => {
      removed.push(dir)
      await fs.rm(dir, { recursive: true, force: true })
    },
    killContainer: kill as unknown as LoginDeps['killContainer'],
  }
})

afterEach(async () => {
  vi.useRealTimers()
  for (const d of scratches) await fs.rm(d, { recursive: true, force: true })
})

// Fake timers do not wait on real file I/O, so the timer tests use a scratch that touches no disk.
function inMemoryScratch() {
  deps.mkScratch = async () => { scratches.push('/nonexistent/scratch'); return '/nonexistent/scratch' }
  deps.rmScratch = async (dir: string) => { removed.push(dir) }
}

async function begin(): Promise<{ loginId: string; url: string; proc: FakeProc }> {
  const before = procs.length
  const p = startLogin(deps)
  await vi.waitFor(() => expect(procs.length).toBeGreaterThan(before))
  const proc = procs[procs.length - 1]
  proc.say(`Opening browser to sign in…\nIf the browser didn't open, visit: ${URL_OUT}\nPaste code here if prompted > `)
  const r = await p
  return { ...r, proc }
}

describe('the sign-in container under the agent protections', () => {
  it('runs on an agent network of its own, inside the range the protections cover, never the default bridge', async () => {
    const { loginId } = await begin()
    const args = spawnCalls[spawnCalls.length - 1].args
    const name = args[args.indexOf('--name') + 1]
    expect(networks.ensured).toEqual([name])
    expect(args[args.indexOf('--network') + 1]).toBe(`${name}-net`)
    expect(args.indexOf('--network')).toBeLessThan(args.indexOf('--entrypoint'))
    await cancelLogin({ loginId })
    expect(networks.released).toEqual([name])
  })

  it('does not start without that network', async () => {
    networks.fail = true
    await expect(startLogin(deps)).rejects.toThrow(/did not start/)
    expect(spawnCalls).toEqual([])
  })
})

describe('startLogin', () => {
  it('returns the sign-in link and a login id', async () => {
    const r = await begin()
    expect(r.url).toBe(URL_OUT)
    expect(r.loginId).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('finds a link split across two chunks and printed on stderr', async () => {
    const p = startLogin(deps)
    await vi.waitFor(() => expect(procs).toHaveLength(1))
    procs[0].stderr.emit('data', Buffer.from('visit: https://claude.ai/oauth/auth'))
    procs[0].stderr.emit('data', Buffer.from('orize?state=x\nPaste code'))
    expect((await p).url).toBe('https://claude.ai/oauth/authorize?state=x')
  })

  it('spawns exactly the container command, as an array', async () => {
    await begin()
    const { cmd, args } = spawnCalls[0]
    expect(cmd).toBe('docker')
    const name = args[args.indexOf('--name') + 1]
    expect(name).toMatch(/^agenthix-dev-claude-login-/)
    expect(args[args.indexOf('--label') + 1]).toBe('com.docker.compose.project=agenthix-dev-agents')
    expect(args.slice(0, 4)).toEqual(['run', '-i', '--rm', '--name'])
    expect(args).toContain('--cap-drop')
    expect(args[args.indexOf('--cap-drop') + 1]).toBe('ALL')
    expect(args).toContain('--security-opt')
    expect(args[args.indexOf('--security-opt') + 1]).toBe('no-new-privileges')
    expect(args).toContain('--memory')
    expect(args).toContain('--pids-limit')
    expect(args[args.indexOf('-v') + 1]).toBe(`${scratches[0]}:/home/appuser/.claude`)
    expect(args.filter(a => a === '-v')).toHaveLength(1)
    expect(args.slice(-4)).toEqual(['claude', 'agenthix-agent', 'auth', 'login'])
    expect(args[args.length - 5]).toBe('--entrypoint')
  })

  it('creates the scratch folder through mkScratch and mounts nothing else', async () => {
    await begin()
    expect(scratches).toHaveLength(1)
  })

  it('cleans up and throws when the process exits before any link', async () => {
    const p = startLogin(deps)
    const assertion = expect(p).rejects.toThrow(/^The login did not start: /)
    await vi.waitFor(() => expect(procs).toHaveLength(1))
    procs[0].say('Error: no such image\n')
    procs[0].exit(125)
    await assertion
    expect(kill).toHaveBeenCalled()
    expect(removed).toEqual(scratches)
  })

  it('cleans up and throws when no link appears within 30 seconds', async () => {
    vi.useFakeTimers()
    inMemoryScratch()
    const p = startLogin(deps)
    const assertion = expect(p).rejects.toThrow(/^The login did not start: /)
    await vi.advanceTimersByTimeAsync(30_001)
    await assertion
    expect(kill).toHaveBeenCalled()
    expect(removed).toEqual(scratches)
  })

  it('does not put the link in the failure text', async () => {
    const p = startLogin(deps)
    const failure = p.catch((e: Error) => e)
    await vi.waitFor(() => expect(procs).toHaveLength(1))
    procs[0].say('failed to open https://claude.ai/x?state=SECRETSTATE')
    procs[0].exit(1)
    const err = await failure
    expect((err as Error).message).toMatch(/^The login did not start: /)
    expect((err as Error).message).not.toContain('SECRETSTATE')
  })

  it('cleans up and throws when docker cannot be run at all', async () => {
    const p = startLogin(deps)
    const assertion = expect(p).rejects.toThrow(/^The login did not start: /)
    await vi.waitFor(() => expect(procs).toHaveLength(1))
    procs[0].emit('error', new Error('spawn docker ENOENT'))
    await assertion
    expect(removed).toEqual(scratches)
  })

  it('refuses a fourth concurrent login', async () => {
    await begin()
    await begin()
    await begin()
    await expect(startLogin(deps)).rejects.toThrow('Too many sign-ins are in progress on this site — try again in a moment')
    expect(spawnCalls).toHaveLength(3)
  })

  it('honours maxConcurrent', async () => {
    deps.maxConcurrent = 1
    await begin()
    await expect(startLogin(deps)).rejects.toThrow(/Too many sign-ins/)
  })

  it('frees a slot once a login is cancelled', async () => {
    const a = await begin()
    await begin()
    await begin()
    await cancelLogin({ loginId: a.loginId }, deps)
    await expect(begin()).resolves.toBeTruthy()
  })
})

describe('finishLogin', () => {
  it('writes the trimmed code and a newline to the same process, then returns the credentials text', async () => {
    const { loginId, proc } = await begin()
    const text = JSON.stringify(OAUTH)
    const p = finishLogin({ loginId, code: '  abc123#xyz  ' }, deps)
    await vi.waitFor(() => expect(proc.writes).toEqual(['abc123#xyz\n']))
    await fs.writeFile(path.join(scratches[0], '.credentials.json'), text)
    proc.say('Login successful.\n')
    proc.exit(0)
    await expect(p).resolves.toEqual({ oauthJson: text })
    expect(spawnCalls).toHaveLength(1)
  })

  it('cleans up after success', async () => {
    const { loginId, proc } = await begin()
    const p = finishLogin({ loginId, code: 'c' }, deps)
    await vi.waitFor(() => expect(proc.writes).toHaveLength(1))
    await fs.writeFile(path.join(scratches[0], '.credentials.json'), JSON.stringify(OAUTH))
    proc.exit(0)
    await p
    expect(kill).toHaveBeenCalled()
    expect(removed).toEqual(scratches)
    await expect(finishLogin({ loginId, code: 'c' }, deps)).rejects.toThrow(/unknown or has expired/i)
  })

  it('rejects an unknown login id', async () => {
    await expect(finishLogin({ loginId: 'nope', code: 'c' }, deps)).rejects.toThrow(/unknown or has expired/i)
  })

  it.each([
    ['a control character', 'ab\ncd'],
    ['a NUL', 'ab\u0000cd'],
    ['an escape', 'ab\u001bcd'],
    ['nothing', '   '],
    ['too many characters', 'x'.repeat(2001)],
  ])('rejects a code with %s without writing', async (_label, code) => {
    const { loginId, proc } = await begin()
    await expect(finishLogin({ loginId, code }, deps)).rejects.toThrow(/code/i)
    expect(proc.writes).toEqual([])
    // The login is still open for a proper code.
    const p = finishLogin({ loginId, code: 'good' }, deps)
    await vi.waitFor(() => expect(proc.writes).toEqual(['good\n']))
    proc.exit(1)
    await expect(p).rejects.toThrow()
  })

  it('rejects a non-string code or id', async () => {
    await expect(finishLogin({ loginId: 5, code: 'c' }, deps)).rejects.toThrow()
    await expect(finishLogin({ loginId: 'x', code: 5 }, deps)).rejects.toThrow()
    await expect(finishLogin(null, deps)).rejects.toThrow()
  })

  it('fails when the process exits 0 without a credentials file', async () => {
    const { loginId, proc } = await begin()
    const p = finishLogin({ loginId, code: 'c' }, deps)
    await vi.waitFor(() => expect(proc.writes).toHaveLength(1))
    proc.exit(0)
    await expect(p).rejects.toThrow('Claude did not accept that code')
    expect(removed).toEqual(scratches)
  })

  it('fails when the file has no claudeAiOauth object', async () => {
    const { loginId, proc } = await begin()
    const p = finishLogin({ loginId, code: 'c' }, deps)
    await vi.waitFor(() => expect(proc.writes).toHaveLength(1))
    await fs.writeFile(path.join(scratches[0], '.credentials.json'), JSON.stringify({ other: 1 }))
    proc.exit(0)
    await expect(p).rejects.toThrow('Claude did not accept that code')
  })

  it('fails with a fixed message that carries neither the code nor process output on a non-zero exit', async () => {
    const { loginId, proc } = await begin()
    const p = finishLogin({ loginId, code: 'MYSECRETCODE' }, deps)
    const assertion = p.catch((e: Error) => e)
    await vi.waitFor(() => expect(proc.writes).toHaveLength(1))
    proc.say('Invalid code MYSECRETCODE\n')
    proc.exit(1)
    const err = await assertion
    expect(err).toBeInstanceOf(Error)
    expect((err as Error).message).toBe('Claude did not accept that code')
    expect(JSON.stringify(err)).not.toContain('MYSECRETCODE')
    expect(kill).toHaveBeenCalled()
    expect(removed).toEqual(scratches)
  })

  it('fails and cleans up when the process does not exit within 60 seconds', async () => {
    const { loginId, proc } = await begin()
    vi.useFakeTimers()
    const p = finishLogin({ loginId, code: 'c' }, deps)
    const assertion = expect(p).rejects.toThrow('Claude did not accept that code')
    await vi.advanceTimersByTimeAsync(60_001)
    await assertion
    expect(kill).toHaveBeenCalled()
    expect(removed).toEqual(scratches)
    expect(proc.writes).toEqual(['c\n'])
  })

  it('refuses a second finish on the same login while the first is running', async () => {
    const { loginId, proc } = await begin()
    const first = finishLogin({ loginId, code: 'one' }, deps)
    await vi.waitFor(() => expect(proc.writes).toHaveLength(1))
    await expect(finishLogin({ loginId, code: 'two' }, deps)).rejects.toThrow(/unknown or has expired|already/i)
    expect(proc.writes).toEqual(['one\n'])
    proc.exit(1)
    await expect(first).rejects.toThrow()
  })

  it('never logs the link query, the code or the credentials', async () => {
    const spies = [vi.spyOn(console, 'log'), vi.spyOn(console, 'warn'), vi.spyOn(console, 'error')]
    spies.forEach(s => s.mockImplementation(() => undefined))
    const { loginId, proc } = await begin()
    const p = finishLogin({ loginId, code: 'MYSECRETCODE' }, deps)
    await vi.waitFor(() => expect(proc.writes).toHaveLength(1))
    await fs.writeFile(path.join(scratches[0], '.credentials.json'), JSON.stringify(OAUTH))
    proc.exit(0)
    await p
    const logged = spies.flatMap(s => s.mock.calls).flat().map(String).join('\n')
    spies.forEach(s => s.mockRestore())
    expect(logged).not.toContain('SECRETSTATE')
    expect(logged).not.toContain('MYSECRETCODE')
    expect(logged).not.toContain('sk-ant')
  })
})

describe('cancelLogin', () => {
  it('kills the container and removes the scratch', async () => {
    const { loginId } = await begin()
    await expect(cancelLogin({ loginId }, deps)).resolves.toEqual({ cancelled: true })
    expect(kill).toHaveBeenCalledTimes(1)
    expect(removed).toEqual(scratches)
  })

  it('is idempotent, and fine for an id it never knew', async () => {
    const { loginId } = await begin()
    await cancelLogin({ loginId }, deps)
    await expect(cancelLogin({ loginId }, deps)).resolves.toEqual({ cancelled: true })
    await expect(cancelLogin({ loginId: 'never' }, deps)).resolves.toEqual({ cancelled: true })
    expect(kill).toHaveBeenCalledTimes(1)
  })

  it('still removes the scratch when docker kill fails (no such container)', async () => {
    kill.mockRejectedValue(new Error('No such container'))
    const { loginId } = await begin()
    await expect(cancelLogin({ loginId }, deps)).resolves.toEqual({ cancelled: true })
    expect(removed).toEqual(scratches)
  })

  it('rejects a non-string id', async () => {
    await expect(cancelLogin({ loginId: 3 }, deps)).rejects.toThrow()
  })
})

describe('the ten-minute limit', () => {
  it('cleans up an abandoned login', async () => {
    vi.useFakeTimers()
    inMemoryScratch()
    const p = startLogin(deps)
    await vi.advanceTimersByTimeAsync(0)
    procs[0].say(`visit: ${URL_OUT}\n`)
    const { loginId } = await p
    await vi.advanceTimersByTimeAsync(9 * 60_000)
    expect(kill).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(60_001)
    expect(kill).toHaveBeenCalledTimes(1)
    expect(removed).toEqual(scratches)
    await expect(finishLogin({ loginId, code: 'c' }, deps)).rejects.toThrow(/unknown or has expired/i)
  })

  it('does not fire for a login that was cancelled', async () => {
    vi.useFakeTimers()
    inMemoryScratch()
    const p = startLogin(deps)
    await vi.advanceTimersByTimeAsync(0)
    procs[0].say(`visit: ${URL_OUT}\n`)
    const { loginId } = await p
    await cancelLogin({ loginId }, deps)
    await vi.advanceTimersByTimeAsync(11 * 60_000)
    expect(kill).toHaveBeenCalledTimes(1)
  })

  it('does not fire for a login that finished', async () => {
    vi.useFakeTimers()
    inMemoryScratch()
    const p = startLogin(deps)
    await vi.advanceTimersByTimeAsync(0)
    procs[0].say(`visit: ${URL_OUT}\n`)
    const { loginId } = await p
    const f = finishLogin({ loginId, code: 'c' }, deps)
    const assertion = expect(f).rejects.toThrow()
    await vi.advanceTimersByTimeAsync(0)
    procs[0].exit(1)
    await assertion
    await vi.advanceTimersByTimeAsync(11 * 60_000)
    expect(kill).toHaveBeenCalledTimes(1)
  })
})
