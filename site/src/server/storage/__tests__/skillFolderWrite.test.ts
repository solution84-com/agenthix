import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { PACKAGE_FORMAT_VERSION, SKILL_TREE_MAX_ENTRIES, SKILL_WRITE_MAX_BYTES, packageDigestInput, type LocationRef } from '@agenthix/core'
import { removeSkillFolder, writeSkillFolder } from '../skillFolderWrite'
import { scanSkills } from '../scanSkills'
import { getFilesDir } from '../paths'

let root: string
beforeEach(async () => {
  root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'skill-write-')))
  process.env.SITE_ROOT = root
  await fs.mkdir(files(), { recursive: true })
})
afterEach(async () => { await fs.rm(root, { recursive: true, force: true }) })

const loc: LocationRef = { ownerType: 'project', ownerId: 'p1', workspaceId: null, taskId: null }
const files = () => getFilesDir('project', 'p1')
const sha = (b: string | Buffer) => createHash('sha256').update(b).digest('hex')
const MD = '---\nname: release\ndescription: Notes\n---\nBody\n'

function transfer(set: Record<string, string | Buffer>, over: { digest?: string; data?: Record<string, string>; list?: unknown[] } = {}) {
  const entries = Object.entries(set).map(([p, c]) => ({ path: p, sha256: sha(c) }))
  const digest = over.digest ?? sha(packageDigestInput({ formatVersion: PACKAGE_FORMAT_VERSION, files: entries }))
  const data = over.data ?? Object.fromEntries(Object.entries(set).map(([p, c]) => [p, Buffer.from(c).toString('base64')]))
  const body = Buffer.from(JSON.stringify({ contents: { formatVersion: PACKAGE_FORMAT_VERSION, files: over.list ?? entries }, data }))
  return { digest, body }
}

async function write(dir: string, set: Record<string, string | Buffer>, at = loc, over = {}) {
  const { digest, body } = transfer(set, over)
  return writeSkillFolder({ loc: at, dir, digest }, body)
}

async function tree(dir: string): Promise<string[]> {
  const out: string[] = []
  const walk = async (rel: string) => {
    for (const e of await fs.readdir(path.join(dir, rel), { withFileTypes: true })) {
      const p = rel ? `${rel}/${e.name}` : e.name
      if (e.isDirectory()) await walk(p)
      else out.push(p)
    }
  }
  await walk('')
  return out.sort()
}

describe("writing a place's skill folder @SC-1603", () => {
  it("writes a new folder for the place, and one for an agent, making the roots, and a scan then finds what was written", async () => {
    await write('.agents/skills/release', { 'SKILL.md': MD, 'scripts/run.sh': 'echo' })
    await write('.agents/agents/a1/skills/mine', { 'SKILL.md': MD })
    expect(await tree(path.join(files(), '.agents/skills/release'))).toEqual(['SKILL.md', 'scripts/run.sh'])
    expect(await fs.readFile(path.join(files(), '.agents/agents/a1/skills/mine/SKILL.md'), 'utf-8')).toBe(MD)
    const { digest } = transfer({ 'SKILL.md': MD, 'scripts/run.sh': 'echo' })
    const scan = await scanSkills({ loc, agentId: 'a1' })
    expect(scan.skills.find(s => s.path === 'release')?.fingerprint).toBe(digest)
  })

  it('replaces the folder whole: a file it no longer holds is gone, and nothing is left beside it', async () => {
    await write('.agents/skills/release', { 'SKILL.md': MD, 'old.md': 'old' })
    await fs.writeFile(path.join(files(), '.agents/skills/release/planted.md'), 'x')
    await write('.agents/skills/release', { 'SKILL.md': MD + 'v2' })
    expect(await tree(path.join(files(), '.agents/skills/release'))).toEqual(['SKILL.md'])
    expect(await fs.readdir(path.join(files(), '.agents/skills'))).toEqual(['release'])
  })

  it.each([
    ['a workspace repository\'s folder', 'workspace/w1/.agents/skills/x'],
    ['a root itself', '.agents/skills'],
    ['a climb', '.agents/skills/../../secret'],
    ['another folder of the place', 'docs/x'],
    ['a hidden folder', '.agents/skills/.x'],
    ['an absolute path', '/etc/x'],
    ['an agent id that climbs', '.agents/agents/../skills/x'],
  ])('refuses %s, writing nothing', async (_what, dir) => {
    await expect(write(dir, { 'SKILL.md': MD })).rejects.toThrow(/location-file\/invalid/)
    expect(await fs.readdir(files())).toEqual([])
  })

  it('refuses a location naming a workspace or a task', async () => {
    await expect(write('.agents/skills/x', { 'SKILL.md': MD }, { ...loc, workspaceId: 'w1' })).rejects.toThrow(/invalid/)
    await expect(write('.agents/skills/x', { 'SKILL.md': MD }, { ...loc, taskId: 't1' })).rejects.toThrow(/invalid/)
  })

  it('refuses a link on the way, and never writes through it', async () => {
    const outside = path.join(root, 'outside')
    await fs.mkdir(outside)
    await fs.symlink(outside, path.join(files(), '.agents'))
    await expect(write('.agents/skills/x', { 'SKILL.md': MD })).rejects.toThrow(/location-file\/refused/)
    expect(await fs.readdir(outside)).toEqual([])
  })

  it('refuses a link standing in for the skill folder, and leaves its target alone', async () => {
    const outside = path.join(root, 'outside')
    await fs.mkdir(outside)
    await fs.writeFile(path.join(outside, 'keep'), 'k')
    await fs.mkdir(path.join(files(), '.agents/skills'), { recursive: true })
    await fs.symlink(outside, path.join(files(), '.agents/skills/x'))
    await expect(write('.agents/skills/x', { 'SKILL.md': MD })).rejects.toThrow(/refused/)
    expect(await fs.readdir(outside)).toEqual(['keep'])
  })

  it('refuses a file standing where the folder or a root would be', async () => {
    await fs.mkdir(path.join(files(), '.agents'), { recursive: true })
    await fs.writeFile(path.join(files(), '.agents/skills'), 'x')
    await expect(write('.agents/skills/x', { 'SKILL.md': MD })).rejects.toThrow(/not_a_directory/)
  })

  it('refuses files that are not the ones named, before writing anything', async () => {
    const other = transfer({ 'SKILL.md': 'other' })
    await expect(write('.agents/skills/x', { 'SKILL.md': MD }, loc, { digest: other.digest })).rejects.toThrow(/not the ones hq named/)
    await expect(write('.agents/skills/x', { 'SKILL.md': MD }, loc, { data: { 'SKILL.md': Buffer.from('swapped').toString('base64') } }))
      .rejects.toThrow(/not the file its contents entry names/)
    expect(await fs.readdir(files())).toEqual([])
  })

  it.each([
    ['a climbing path', { '../escape.md': 'x', 'SKILL.md': MD }],
    ['a hidden file', { '.env': 'x', 'SKILL.md': MD }],
    ['an absolute path', { '/etc/x': 'x', 'SKILL.md': MD }],
    ['no SKILL.md', { 'README.md': 'x' }],
    ['two names one disk would store as one', { 'SKILL.md': MD, 'a.md': 'x', 'A.md': 'y' }],
  ])('refuses %s', async (_what, set) => {
    await expect(write('.agents/skills/x', set)).rejects.toThrow(/location-file\/invalid/)
    expect(await fs.readdir(files())).toEqual([])
  })

  it('refuses a file sent but not listed, and one listed but not sent', async () => {
    const extra = Buffer.from('x').toString('base64')
    await expect(write('.agents/skills/x', { 'SKILL.md': MD }, loc, { data: { 'SKILL.md': Buffer.from(MD).toString('base64'), 'more.md': extra } }))
      .rejects.toThrow(/invalid/)
    await expect(write('.agents/skills/x', { 'SKILL.md': MD, 'b.md': 'b' }, loc, { data: { 'SKILL.md': Buffer.from(MD).toString('base64') } }))
      .rejects.toThrow(/invalid/)
  })

  it('refuses what is over the bounds', async () => {
    await expect(write('.agents/skills/x', { 'SKILL.md': MD, 'big.bin': Buffer.alloc(SKILL_WRITE_MAX_BYTES + 1) })).rejects.toThrow(/too_large/)
    const many = Object.fromEntries(Array.from({ length: SKILL_TREE_MAX_ENTRIES + 1 }, (_, i) => [`f${i}.md`, 'x']))
    await expect(write('.agents/skills/x', { ...many, 'SKILL.md': MD })).rejects.toThrow(/too_many/)
    await expect(write('.agents/skills/x', { 'SKILL.md': MD, 'a/b/c/d/e/f/g/h/i/j.md': 'x' })).rejects.toThrow(/too_many/)
  })

  it('takes the folder depth and the entry count staging takes', async () => {
    await expect(write('.agents/skills/x', { 'SKILL.md': MD, 'a/b/c/d/e/f/g/h/i.md': 'x' })).resolves.not.toThrow()
    const inFolder = Object.fromEntries(Array.from({ length: SKILL_TREE_MAX_ENTRIES - 2 }, (_, i) => [`a/f${i}.md`, 'x']))
    await expect(write('.agents/skills/y', { 'SKILL.md': MD, ...inFolder })).rejects.toThrow(/too_many/)
  })

  it('refuses a body that is not a transfer', async () => {
    const { digest } = transfer({ 'SKILL.md': MD })
    await expect(writeSkillFolder({ loc, dir: '.agents/skills/x', digest }, Buffer.from('not json'))).rejects.toThrow(/invalid/)
    await expect(writeSkillFolder({ loc, dir: '.agents/skills/x', digest: 'nope' }, Buffer.from('{}'))).rejects.toThrow(/does not accept/)
  })

  it('takes two writes to one folder one at a time, the last one winning', async () => {
    await Promise.all([write('.agents/skills/x', { 'SKILL.md': MD + '1' }), write('.agents/skills/x', { 'SKILL.md': MD + '2' })])
    expect(await fs.readFile(path.join(files(), '.agents/skills/x/SKILL.md'), 'utf-8')).toBe(MD + '2')
    expect(await fs.readdir(path.join(files(), '.agents/skills'))).toEqual(['x'])
  })
})

describe("removing a place's skill folder @SC-1603", () => {
  it('removes it, and answers false for one already gone', async () => {
    await write('.agents/skills/x', { 'SKILL.md': MD })
    expect(await removeSkillFolder({ loc, dir: '.agents/skills/x' })).toEqual({ removed: true })
    expect(await fs.readdir(path.join(files(), '.agents/skills'))).toEqual([])
    expect(await removeSkillFolder({ loc, dir: '.agents/skills/x' })).toEqual({ removed: false })
    expect(await removeSkillFolder({ loc, dir: '.agents/agents/a1/skills/x' })).toEqual({ removed: false })
  })

  it("refuses a workspace's folder, any other path, and a link, removing nothing behind it", async () => {
    await expect(removeSkillFolder({ loc, dir: 'workspace/w1/.claude/skills/x' })).rejects.toThrow(/invalid/)
    await expect(removeSkillFolder({ loc, dir: '.agents/skills/../../x' })).rejects.toThrow(/invalid/)
    const outside = path.join(root, 'outside')
    await fs.mkdir(outside)
    await fs.writeFile(path.join(outside, 'keep'), 'k')
    await fs.mkdir(path.join(files(), '.agents/skills'), { recursive: true })
    await fs.symlink(outside, path.join(files(), '.agents/skills/x'))
    await expect(removeSkillFolder({ loc, dir: '.agents/skills/x' })).rejects.toThrow(/refused/)
    expect(await fs.readdir(outside)).toEqual(['keep'])
  })
})

describe("a place whose files folder does not exist yet @SC-1603", () => {
  const fresh: LocationRef = { ownerType: 'user', ownerId: 'newcomer', workspaceId: null, taskId: null }

  it('makes the folder on a first write, and a scan then finds the skill', async () => {
    await write('.agents/skills/first', { 'SKILL.md': MD }, fresh)
    const home = getFilesDir('user', 'newcomer')
    expect(await fs.readFile(path.join(home, '.agents/skills/first/SKILL.md'), 'utf-8')).toBe(MD)
    expect((await scanSkills({ loc: fresh, agentId: 'a1' })).skills.map(s => s.path)).toEqual(['first'])
  })

  it('finds nothing to scan or remove before any write, and makes nothing', async () => {
    expect((await scanSkills({ loc: fresh, agentId: 'a1' })).skills).toEqual([])
    expect(await removeSkillFolder({ loc: fresh, dir: '.agents/skills/x' })).toEqual({ removed: false })
    await expect(fs.lstat(getFilesDir('user', 'newcomer'))).rejects.toThrow()
  })

  it('refuses a ref that is not a place, making nothing', async () => {
    const bad = { ...fresh, ownerId: '../escape' }
    await expect(write('.agents/skills/x', { 'SKILL.md': MD }, bad)).rejects.toThrow()
    await expect(fs.lstat(path.join(root, 'escape'))).rejects.toThrow()
    await expect(write('.agents/skills/x', { 'SKILL.md': MD }, { ...fresh, workspaceId: 'w1' })).rejects.toThrow(/invalid/)
    await expect(fs.lstat(getFilesDir('user', 'newcomer'))).rejects.toThrow()
  })

  it('refuses a link standing where the files folder goes, writing nothing behind it', async () => {
    const outside = path.join(root, 'outside')
    await fs.mkdir(outside)
    await fs.mkdir(path.dirname(getFilesDir('user', 'newcomer')), { recursive: true })
    await fs.symlink(outside, getFilesDir('user', 'newcomer'))
    await expect(write('.agents/skills/x', { 'SKILL.md': MD }, fresh)).rejects.toThrow(/not_found/)
    expect(await fs.readdir(outside)).toEqual([])
  })
})
