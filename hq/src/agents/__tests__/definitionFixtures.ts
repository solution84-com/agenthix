import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs/promises'
import { prisma } from '../../test/db'
import { createUserWithRole } from '../../test/factories'

// Helpers shared by the integration tests of an agent's definition (skills,
// settings, archives, overrides): a real operation context, and temporary
// storage and assets roots for the operations that write files.

/** The context an operation receives: the caller, and every entity delegate on the test client. */
export function opContext(user: { id: string } | undefined) {
  return {
    user,
    entities: {
      Agent: prisma.agent,
      AgentSession: prisma.agentSession,
      Task: prisma.task,
      Skill: prisma.skill,
      Org: prisma.org,
      Project: prisma.project,
      AgentOverride: prisma.agentOverride,
    },
  } as any
}

/** A person with the given organisation role, and the context to act as them. */
export async function contextWithRole(role: 'ADMIN' | 'MEMBER') {
  const user = await createUserWithRole(role)
  return { user, ctx: opContext(user) }
}

/** A person with no settings row at all, so no organisation role. */
export async function contextWithoutRole() {
  const user = await prisma.user.create({ data: {} })
  return { user, ctx: opContext(user) }
}

export type TempRoots = { root: string; storage: string; assets: string; restore: () => Promise<void> }

/** Points HQ_STORAGE_ROOT and HQ_ASSETS_ROOT at a fresh temporary directory until `restore` is called. */
export async function useTempRoots(): Promise<TempRoots> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-def-'))
  const storage = path.join(root, 'storage')
  const assets = path.join(root, 'assets')
  await fs.mkdir(storage, { recursive: true })
  await fs.mkdir(path.join(assets, 'library', 'skills'), { recursive: true })
  const prev = { storage: process.env.HQ_STORAGE_ROOT, assets: process.env.HQ_ASSETS_ROOT }
  process.env.HQ_STORAGE_ROOT = storage
  process.env.HQ_ASSETS_ROOT = assets
  return {
    root,
    storage,
    assets,
    restore: async () => {
      if (prev.storage === undefined) delete process.env.HQ_STORAGE_ROOT
      else process.env.HQ_STORAGE_ROOT = prev.storage
      if (prev.assets === undefined) delete process.env.HQ_ASSETS_ROOT
      else process.env.HQ_ASSETS_ROOT = prev.assets
      await fs.rm(root, { recursive: true, force: true })
    },
  }
}

export async function writeTextFile(file: string, content: string) {
  await fs.mkdir(path.dirname(file), { recursive: true })
  await fs.writeFile(file, content, 'utf-8')
}

/** Every file and directory under `dir`, as relative paths mapped to contents ('' for a directory). */
export async function snapshotTree(dir: string): Promise<Record<string, string>> {
  const out: Record<string, string> = {}
  async function walk(current: string) {
    for (const entry of await fs.readdir(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name)
      const rel = path.relative(dir, full)
      if (entry.isDirectory()) {
        out[`${rel}/`] = ''
        await walk(full)
      } else {
        out[rel] = await fs.readFile(full, 'utf-8')
      }
    }
  }
  await walk(dir)
  return out
}
