/**
 * The agent preset tools read the folders the preset picker serves, and an
 * applied preset is copied into hq's own storage and set on the agent —
 * against the real test database and real folders.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { prisma } from '../../../test/db'

vi.mock('wasp/server', async () => {
  const { prisma } = await import('../../../test/db')
  const { HttpError } = await vi.importActual<typeof import('wasp/server')>('wasp/server')
  return { prisma, HttpError }
})

import { listPresetsOp, applyAgentPresetOp } from '../agentOps'
import { connectionCaller } from '../../../shared/testing/connectionCaller'

const saved = { storage: process.env.HQ_STORAGE_ROOT, assets: process.env.HQ_ASSETS_ROOT }
let root: string
const CTX = connectionCaller({ role: 'ADMIN' })

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'preset-ops-'))
  process.env.HQ_ASSETS_ROOT = path.join(root, 'assets')
  process.env.HQ_STORAGE_ROOT = path.join(root, 'storage')
  for (const [dir, file] of [['avatars', 'brain.png'], ['avatars', 'logo.svg'], ['covers', 'wave.png']]) {
    await fs.mkdir(path.join(root, 'assets', dir), { recursive: true })
    await fs.writeFile(path.join(root, 'assets', dir, file), `${dir}/${file}`)
  }
  await fs.mkdir(path.join(root, 'storage'), { recursive: true })
  await prisma.agent.create({ data: { id: 'a1', name: 'Bot', handle: 'bot' } })
})
afterEach(async () => {
  for (const [key, value] of [['HQ_STORAGE_ROOT', saved.storage], ['HQ_ASSETS_ROOT', saved.assets]] as const) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  await fs.rm(root, { recursive: true, force: true })
})

describe('agent preset tools read the folders the preset picker serves', () => {
  it('list_presets reads <assets>/avatars, and offers no SVG, which the image route would refuse to serve back', async () => {
    expect(await listPresetsOp(CTX, { type: 'avatars' })).toEqual({ type: 'avatars', files: ['brain.png'] })
  })

  it('apply_agent_preset refuses an SVG rather than copying what the image route cannot serve', async () => {
    await expect(applyAgentPresetOp(CTX, { agentId: 'a1', imageType: 'avatar', filename: 'logo.svg' })).rejects.toThrow('Invalid preset filename')
    expect((await prisma.agent.findUniqueOrThrow({ where: { id: 'a1' } })).avatarUrl).toBeNull()
  })

  it("apply_agent_preset copies from <assets>/covers into hq's own storage and sets it on the agent", async () => {
    const result = await applyAgentPresetOp(CTX, { agentId: 'a1', imageType: 'cover', filename: 'wave.png' })
    const [copied] = await fs.readdir(path.join(root, 'storage', 'agents', 'a1', 'images'))
    expect(copied).toMatch(/\.png$/)
    expect(await fs.readFile(path.join(root, 'storage', 'agents', 'a1', 'images', copied), 'utf8')).toBe('covers/wave.png')
    expect(result).toMatchObject({ success: true, url: `/agents/a1/images/${copied}` })
    expect((await prisma.agent.findUniqueOrThrow({ where: { id: 'a1' } })).coverUrl).toBe(`/agents/a1/images/${copied}`)
  })

  it('apply_agent_preset fails for an agent that does not exist, copying nothing', async () => {
    await expect(applyAgentPresetOp(CTX, { agentId: 'nobody', imageType: 'cover', filename: 'wave.png' })).rejects.toThrow()
    await expect(fs.readdir(path.join(root, 'storage', 'agents'))).rejects.toThrow()
  })
})
