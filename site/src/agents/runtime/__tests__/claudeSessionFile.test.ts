/**
 * Claude's answer to "does this session still exist?" (adr-0076), against a
 * real directory laid out the way Claude Code lays out its own.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

vi.mock('@anthropic-ai/claude-agent-sdk', () => ({ query: vi.fn() }))
vi.mock('#db', () => ({ prisma: {} }))

import { claudeProjectFolderName, claudeSessionFileExists } from '../claudeSessionFile'
import { ClaudeSDKRuntime } from '../ClaudeSDKRuntime'

const SESSION_ID = '3f2a91c0-1b2c-4d5e-8f90-a1b2c3d4e5f6'
let home: string

async function fileSession(configDir: string, folder: string, contents = '{"type":"user"}\n') {
  const dir = path.join(configDir, 'projects', folder)
  await fs.mkdir(dir, { recursive: true })
  await fs.writeFile(path.join(dir, `${SESSION_ID}.jsonl`), contents)
}

beforeEach(async () => {
  home = await fs.mkdtemp(path.join(os.tmpdir(), 'claude-home-'))
})
afterEach(async () => {
  vi.unstubAllEnvs()
  await fs.rm(home, { recursive: true, force: true })
})

describe('where Claude Code files a session', () => {
  it('names the project folder after the working directory, every non-alphanumeric character a dash', () => {
    expect(claudeProjectFolderName('/projects/p-1/workspaces/w_2.x')).toBe('-projects-p-1-workspaces-w-2-x')
  })
})

describe('claudeSessionFileExists', () => {
  const cwd = '/projects/9d1c/workspaces/77ab'

  it('finds the session filed under its working directory', async () => {
    await fileSession(home, claudeProjectFolderName(cwd))
    expect(await claudeSessionFileExists(home, cwd, SESSION_ID)).toBe(true)
  })

  it('answers from the harness home only: a `.claude`, `projects` or transcript replaced by a link counts as not there', async () => {
    const other = path.join(home, 'other', '.claude')
    await fileSession(other, claudeProjectFolderName(cwd))
    const mine = path.join(home, 'mine')
    await fs.mkdir(mine)
    await fs.symlink(other, path.join(mine, '.claude'))
    expect(await claudeSessionFileExists(path.join(mine, '.claude'), cwd, SESSION_ID, mine)).toBe(false)

    await fs.rm(path.join(mine, '.claude'))
    await fs.mkdir(path.join(mine, '.claude'))
    await fs.symlink(path.join(other, 'projects'), path.join(mine, '.claude', 'projects'))
    expect(await claudeSessionFileExists(path.join(mine, '.claude'), cwd, SESSION_ID, mine)).toBe(false)

    await fs.rm(path.join(mine, '.claude', 'projects'))
    const folder = path.join(mine, '.claude', 'projects', claudeProjectFolderName(cwd))
    await fs.mkdir(folder, { recursive: true })
    await fs.symlink(path.join(other, 'projects', claudeProjectFolderName(cwd), `${SESSION_ID}.jsonl`), path.join(folder, `${SESSION_ID}.jsonl`))
    expect(await claudeSessionFileExists(path.join(mine, '.claude'), cwd, SESSION_ID, mine)).toBe(false)

    await fs.rm(path.join(folder, `${SESSION_ID}.jsonl`))
    await fileSession(path.join(mine, '.claude'), claudeProjectFolderName(cwd))
    expect(await claudeSessionFileExists(path.join(mine, '.claude'), cwd, SESSION_ID, mine)).toBe(true)
  })

  it('answers false when the home holds nothing', async () => {
    expect(await claudeSessionFileExists(home, cwd, SESSION_ID)).toBe(false)
  })

  it('answers false for a session filed under a different working directory', async () => {
    await fileSession(home, claudeProjectFolderName('/projects/9d1c/files'))
    expect(await claudeSessionFileExists(home, cwd, SESSION_ID)).toBe(false)
  })

  it('does not count an empty transcript, which there is nothing in to resume', async () => {
    await fileSession(home, claudeProjectFolderName(cwd), '')
    expect(await claudeSessionFileExists(home, cwd, SESSION_ID)).toBe(false)
  })

  it('matches a long working directory on the first 200 characters of its folder name, whatever hash follows', async () => {
    const longCwd = `/projects/${'a'.repeat(120)}/workspaces/${'b'.repeat(120)}`
    await fileSession(home, `${claudeProjectFolderName(longCwd).slice(0, 200)}-1x2y3z`)
    expect(await claudeSessionFileExists(home, longCwd, SESSION_ID)).toBe(true)
  })

  it('refuses an id that could leave the folder', async () => {
    await expect(claudeSessionFileExists(home, cwd, '../escape')).rejects.toThrow(/unexpected id/)
  })
})

describe('ClaudeSDKRuntime.sessionExists', () => {
  it('looks in the runner\'s home under container isolation', async () => {
    vi.stubEnv('AGENT_CONTAINER_ISOLATION', 'true')
    await fileSession(home, claudeProjectFolderName('/projects/p1/files'))

    const runtime = new ClaudeSDKRuntime()
    expect(await runtime.sessionExists({ sessionId: SESSION_ID, harnessHomeDir: home, workingDirectory: '/projects/p1/files' })).toBe(true)
    await fs.rm(path.join(home, 'projects'), { recursive: true })
    expect(await runtime.sessionExists({ sessionId: SESSION_ID, harnessHomeDir: home, workingDirectory: '/projects/p1/files' })).toBe(false)
  })

  it('looks in this process\'s own Claude config dir without a container, where the harness actually keeps it', async () => {
    vi.stubEnv('AGENT_CONTAINER_ISOLATION', 'false')
    vi.stubEnv('CLAUDE_CONFIG_DIR', home)
    const workDir = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'claude-cwd-')))
    await fileSession(home, claudeProjectFolderName(workDir))

    const runtime = new ClaudeSDKRuntime()
    expect(await runtime.sessionExists({ sessionId: SESSION_ID, harnessHomeDir: '/somewhere/else', workingDirectory: workDir })).toBe(true)
    await fs.rm(workDir, { recursive: true, force: true })
  })
})
