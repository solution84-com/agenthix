import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { versionOf } from '@agenthix/core/file-tools'

export const project = { ownerType: 'project' as const, ownerId: 'proj-0001' }
export const org = { ownerType: 'org' as const, ownerId: 'org' }

export function page(title: string, body = 'Releases are cut from main on Thursdays.\n', extra = ''): string {
  return `---\ntitle: ${title}\ndescription: How we cut and publish a release.\ntags: [releases]\n${extra}---\n\n${body}`
}

export const versionOfText = (text: string) => versionOf(new TextEncoder().encode(text))

/** A fresh site root for each test, and the folder outside it a link would lead to. */
export function useSiteRoot(): { root: () => string; outside: () => string; setUp: () => Promise<void>; tearDown: () => Promise<void> } {
  let root = ''
  let outside = ''
  const saved = process.env.SITE_ROOT
  return {
    root: () => root,
    outside: () => outside,
    setUp: async () => {
      root = await fs.mkdtemp(path.join(os.tmpdir(), 'site-knowledge-'))
      outside = await fs.mkdtemp(path.join(os.tmpdir(), 'site-outside-'))
      process.env.SITE_ROOT = root
    },
    tearDown: async () => {
      if (saved === undefined) delete process.env.SITE_ROOT
      else process.env.SITE_ROOT = saved
      await fs.rm(root, { recursive: true, force: true })
      await fs.rm(outside, { recursive: true, force: true })
    },
  }
}

/** Every file under `dir`, relative to it. */
export async function filesUnder(dir: string): Promise<string[]> {
  const out: string[] = []
  const walk = async (at: string, rel: string) => {
    for (const d of await fs.readdir(at, { withFileTypes: true }).catch(() => [])) {
      const r = rel ? `${rel}/${d.name}` : d.name
      if (d.isDirectory()) await walk(path.join(at, d.name), r)
      else out.push(r)
    }
  }
  await walk(dir, '')
  return out.sort()
}
