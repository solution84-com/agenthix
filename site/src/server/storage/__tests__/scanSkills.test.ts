import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { PACKAGE_FORMAT_VERSION, SCAN_SKILLS_MAX_PER_PLACE, SKILL_TREE_MAX_BYTES, packageDigestInput } from '@agenthix/core'
import { scanSkills } from '../scanSkills'
import { getFilesDir, getWorkspaceDir } from '../paths'
import { stageSkills } from '../../../agents/runtime/skillStaging'

let root: string
beforeEach(async () => {
  root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'scan-')))
  process.env.SITE_ROOT = root
})
afterEach(async () => { await fs.rm(root, { recursive: true, force: true }) })

const loc = { ownerType: 'project' as const, ownerId: 'p1' }
const sha = (b: string | Buffer) => createHash('sha256').update(b).digest('hex')
const fingerprint = (files: Record<string, string>) =>
  sha(packageDigestInput({ formatVersion: PACKAGE_FORMAT_VERSION, files: Object.entries(files).map(([p, c]) => ({ path: p, sha256: sha(c) })) }))

async function writeTree(dir: string, files: Record<string, string>): Promise<void> {
  for (const [rel, content] of Object.entries(files)) {
    await fs.mkdir(path.dirname(path.join(dir, rel)), { recursive: true })
    await fs.writeFile(path.join(dir, rel), content)
  }
}

const files = () => getFilesDir('project', 'p1')
const MD = '---\nname: Release notes\ndescription: Write the notes\nmetadata:\n  version: "4"\n  identity: agenthix/release-notes\n---\nBody\n'

describe('scanning a place for skills @SC-1602', () => {
  it("lists the place's, the agent's and each workspace's three folders, with what staging would check", async () => {
    await writeTree(path.join(files(), '.agents/skills/release'), { 'SKILL.md': MD, 'scripts/x.sh': 'x' })
    await writeTree(path.join(files(), '.agents/agents/a1/skills/mine'), { 'SKILL.md': '---\nname: Mine\n---\n' })
    await writeTree(path.join(files(), '.agents/agents/a2/skills/theirs'), { 'SKILL.md': 'x' })
    await writeTree(path.join(getWorkspaceDir({ ...loc, id: 'w1' }), '.claude/skills/lint'), { 'SKILL.md': 'lint' })
    await writeTree(path.join(getWorkspaceDir({ ...loc, id: 'w1' }), '.github/skills/lint'), { 'SKILL.md': 'lint2' })

    const result = await scanSkills({ loc, agentId: 'a1', workspaces: [{ id: 'w1', folder: 'repo' }] })

    expect(result.truncated).toBe(false)
    expect(result.problems).toEqual([])
    expect(result.skills).toEqual([
      { group: 'place', path: 'release', fingerprint: fingerprint({ 'SKILL.md': MD, 'scripts/x.sh': 'x' }), name: 'Release notes', description: 'Write the notes', version: '4', identity: 'agenthix/release-notes' },
      { group: 'agent', agentId: 'a1', path: 'mine', fingerprint: fingerprint({ 'SKILL.md': '---\nname: Mine\n---\n' }), name: 'Mine', description: '' },
      { group: 'workspace', workspaceId: 'w1', workspaceFolder: '.claude/skills', path: 'lint', fingerprint: fingerprint({ 'SKILL.md': 'lint' }), name: '', description: '' },
      { group: 'workspace', workspaceId: 'w1', workspaceFolder: '.github/skills', path: 'lint', fingerprint: fingerprint({ 'SKILL.md': 'lint2' }), name: '', description: '' },
    ])
  })

  it('lists no agent folder for a scan that names no agent, and still lists the place\'s', async () => {
    await writeTree(path.join(files(), '.agents/skills/release'), { 'SKILL.md': MD })
    await writeTree(path.join(files(), '.agents/agents/a1/skills/mine'), { 'SKILL.md': 'x' })
    for (const agentId of ['', '../a1', 'a/b']) {
      const result = await scanSkills({ loc, agentId })
      expect(result.skills.map(s => [s.group, s.path])).toEqual([['place', 'release']])
    }
  })

  it('gives the fingerprint staging then accepts, hidden entries left out of both', async () => {
    await writeTree(path.join(files(), '.agents/skills/release'), { 'SKILL.md': MD, '.git/HEAD': 'x' })
    const [found] = (await scanSkills({ loc, agentId: 'a1' })).skills
    expect(found.fingerprint).toBe(fingerprint({ 'SKILL.md': MD }))
    const dest = path.join(root, 'out')
    const staged = await stageSkills({
      place: loc, agentId: 'a1', personId: null, installed: [], person: [],
      files: [{ placeId: 'p1', path: '.agents/skills/release', fingerprint: found.fingerprint, group: 'place' }],
    }, dest)
    expect(staged.staged.map(s => s.name)).toEqual(['shared-release'])
  })

  it('reports a link, a folder over the bounds, and a folder that is no skill name; skips hidden folders', async () => {
    await writeTree(path.join(files(), '.agents/skills/linked'), { 'SKILL.md': MD })
    await fs.symlink('/etc/passwd', path.join(files(), '.agents/skills/linked/passwd'))
    await writeTree(path.join(files(), '.agents/skills/big'), { 'SKILL.md': MD, 'x.bin': 'x'.repeat(SKILL_TREE_MAX_BYTES + 1) })
    await writeTree(path.join(files(), '.agents/skills/Not A Name'), { 'SKILL.md': MD })
    await writeTree(path.join(files(), '.agents/skills/.hidden'), { 'SKILL.md': MD })
    await fs.symlink(path.join(root, 'elsewhere'), path.join(files(), '.agents/skills/out'))
    const result = await scanSkills({ loc, agentId: 'a1' })
    expect(result.skills).toEqual([])
    expect(result.problems.map(p => [p.path, p.reason.slice(0, 12)])).toEqual([
      ['Not A Name', 'its folder n'], ['big', 'it is larger'], ['linked', 'it holds a s'], ['out', 'it holds a s'],
    ])
  })

  it('reports at most the cap of skills per place, and says it stopped @security-L1', async () => {
    for (let i = 0; i <= SCAN_SKILLS_MAX_PER_PLACE; i++) await writeTree(path.join(files(), `.agents/skills/s${i}`), { 'SKILL.md': 'x' })
    const result = await scanSkills({ loc, agentId: 'a1' })
    expect(result.skills).toHaveLength(SCAN_SKILLS_MAX_PER_PLACE)
    expect(result.truncated).toBe(true)
  })

  it('reads nothing through a skills folder replaced by a link, and stores nothing', async () => {
    await writeTree(path.join(root, 'projects/p2/files/.agents/skills/secret'), { 'SKILL.md': MD })
    await fs.mkdir(path.join(files(), '.agents'), { recursive: true })
    await fs.symlink(path.join(root, 'projects/p2/files/.agents/skills'), path.join(files(), '.agents/skills'))
    const before = await fs.readdir(root, { recursive: true })
    expect((await scanSkills({ loc, agentId: 'a1' })).skills).toEqual([])
    expect(await fs.readdir(root, { recursive: true })).toEqual(before)
  })

  it('refuses params of the wrong shape', async () => {
    await expect(scanSkills({ loc, agentId: 42 })).rejects.toThrow(/does not accept/)
    await expect(scanSkills({ loc: { ...loc, ownerId: '../p2' }, agentId: 'a1' }).then(r => r.skills, () => [])).resolves.toEqual([])
  })
})
