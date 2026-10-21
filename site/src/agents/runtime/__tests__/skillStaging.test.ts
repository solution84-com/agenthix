import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {
  stageSkills, skillRootsFor,
  MAX_BOUNDARY_ENTRIES, MAX_BOUNDARY_BYTES, MAX_BOUNDARY_DEPTH,
} from '../skillStaging'

let dir: string
beforeEach(async () => {
  // realpath'd immediately: on macOS os.tmpdir() sits under /var, itself a
  // symlink to /private/var, so an un-resolved `dir` used as a sandbox home
  // would never match fs.realpath()'s output for anything built under it —
  // exactly the alias resolveBoundaryOverrideDir's own realpath call always
  // clears in production (it hands back already-resolved paths).
  dir = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'stage-')))
})
afterEach(async () => { await fs.rm(dir, { recursive: true, force: true }) })

async function skill(root: string, slug: string, md: string, extra: Record<string, string> = {}) {
  await fs.mkdir(path.join(dir, root, 'skills', slug), { recursive: true })
  await fs.writeFile(path.join(dir, root, 'skills', slug, 'SKILL.md'), md)
  for (const [name, text] of Object.entries(extra)) await fs.writeFile(path.join(dir, root, 'skills', slug, name), text)
}

/** A boundary override rooted at dir/'home', with the override dir itself already
 *  a real (non-symlinked) directory under it — mirrors what resolveBoundaryOverrideDir
 *  hands back once it has already validated containment. */
async function boundaryOverride() {
  const filesHome = path.join(dir, 'home')
  const overrideDir = path.join(filesHome, '.agents', 'agents', 'agent-1')
  await fs.mkdir(overrideDir, { recursive: true })
  return { dir: overrideDir, filesHome }
}

describe('skill staging', () => {
  it('stages one slug from all four sources side by side, none replacing another', async () => {
    for (const root of ['platform', 'org', 'agent', 'boundary']) await skill(root, 'review', `---\nname: Review\ndescription: from ${root}\n---\n`)
    await skill('agent', 'review', '---\nname: Review\ndescription: from agent\n---\n', { 'notes.md': 'n' })
    const roots = skillRootsFor(
      { platformDir: path.join(dir, 'platform'), orgDir: path.join(dir, 'org'), agentDir: path.join(dir, 'agent') },
      { dir: path.join(dir, 'boundary'), filesHome: dir },
    )
    const dest = path.join(dir, 'out')
    const staged = await stageSkills(roots, dest)
    expect(staged.map(s => s.name)).toEqual(['platform-review', 'org-review', 'agent-review', 'boundary-review'])
    expect((await fs.readdir(dest)).sort()).toEqual(['agent-review', 'boundary-review', 'org-review', 'platform-review'])
    expect(await fs.readFile(path.join(dest, 'org-review', 'SKILL.md'), 'utf-8')).toBe('---\nname: org-review\ndescription: "from org"\n---\n')
    expect(await fs.readFile(path.join(dest, 'agent-review', 'notes.md'), 'utf-8')).toBe('n')
  })

  it("stages a boundary skill's instructions without the front matter keys that would run commands", async () => {
    const override = await boundaryOverride()
    await fs.mkdir(path.join(override.dir, 'skills', 'deploy'), { recursive: true })
    await fs.writeFile(path.join(override.dir, 'skills', 'deploy', 'SKILL.md'),
      '---\nname: Deploy\ndescription: Ships it\nallowed-tools: Bash\nhooks:\n  PreToolUse:\n    - hooks: [{type: command, command: "id"}]\n---\nRun the deploy.\n')
    const dest = path.join(dir, 'out')
    await stageSkills([{ source: 'boundary', dir: path.join(override.dir, 'skills'), sandboxHome: override.filesHome }], dest)
    expect(await fs.readFile(path.join(dest, 'boundary-deploy', 'SKILL.md'), 'utf-8'))
      .toBe('---\nname: boundary-deploy\ndescription: "Ships it"\n---\nRun the deploy.\n')
  })

  it('has no org or boundary root when the run has neither', () => {
    expect(skillRootsFor({ platformDir: '/p', orgDir: null, agentDir: '/a' }, null)).toEqual([
      { source: 'platform', dir: '/p/skills' }, { source: 'agent', dir: '/a/skills' },
    ])
  })

  it('skips links, skills without SKILL.md, and slugs that cannot be namespaced', async () => {
    await skill('boundary', 'ok', 'x')
    await fs.symlink('/etc', path.join(dir, 'boundary', 'skills', 'ok', 'etc'))
    await fs.mkdir(path.join(dir, 'boundary', 'skills', 'empty'), { recursive: true })
    await skill('boundary', 'x'.repeat(56), 'too long')
    const dest = path.join(dir, 'out')
    const staged = await stageSkills([{ source: 'boundary', dir: path.join(dir, 'boundary', 'skills') }], dest)
    expect(staged.map(s => s.name)).toEqual(['boundary-ok'])
    expect(await fs.readdir(path.join(dest, 'boundary-ok'))).toEqual(['SKILL.md'])
  })

  describe('a boundary root confined to the files home', () => {
    it('refuses a skills root that is itself a link outside the files home', async () => {
      const override = await boundaryOverride()
      const outside = path.join(dir, 'outside-skills')
      await fs.mkdir(path.join(outside, 'evil'), { recursive: true })
      await fs.writeFile(path.join(outside, 'evil', 'SKILL.md'), '---\nname: Evil\n---\n')
      // The exploit shape from the review: `skills` itself is a symlink out of
      // the files home, e.g. to a sibling boundary's own override directory.
      await fs.symlink(outside, path.join(override.dir, 'skills'))

      const roots = skillRootsFor({ platformDir: path.join(dir, 'platform'), orgDir: null, agentDir: path.join(dir, 'agent') }, override)
      const staged = await stageSkills(roots, path.join(dir, 'out'))

      expect(staged.filter(s => s.source === 'boundary')).toEqual([])
    })

    it('refuses a slug directory that is a link outside the files home, even when skills/ itself is fine', async () => {
      const override = await boundaryOverride()
      await fs.mkdir(path.join(override.dir, 'skills'), { recursive: true })
      const outside = path.join(dir, 'outside-slug')
      await fs.mkdir(outside, { recursive: true })
      await fs.writeFile(path.join(outside, 'SKILL.md'), '---\nname: Evil\n---\n')
      await fs.symlink(outside, path.join(override.dir, 'skills', 'evil'))

      const roots = skillRootsFor({ platformDir: path.join(dir, 'platform'), orgDir: null, agentDir: path.join(dir, 'agent') }, override)
      const staged = await stageSkills(roots, path.join(dir, 'out'))

      expect(staged.filter(s => s.source === 'boundary')).toEqual([])
    })

    it('refuses a nested link inside a legitimate skill directory, without aborting the rest of the tree', async () => {
      const override = await boundaryOverride()
      await fs.mkdir(path.join(override.dir, 'skills', 'ok', 'sub'), { recursive: true })
      await fs.writeFile(path.join(override.dir, 'skills', 'ok', 'SKILL.md'), '---\nname: Ok\n---\n')
      await fs.writeFile(path.join(override.dir, 'skills', 'ok', 'sub', 'real.md'), 'real')
      const outside = path.join(dir, 'outside-nested')
      await fs.mkdir(outside, { recursive: true })
      await fs.writeFile(path.join(outside, 'secret.md'), 'secret')
      await fs.symlink(outside, path.join(override.dir, 'skills', 'ok', 'sub', 'linked'))

      const roots = skillRootsFor({ platformDir: path.join(dir, 'platform'), orgDir: null, agentDir: path.join(dir, 'agent') }, override)
      const dest = path.join(dir, 'out')
      const staged = await stageSkills(roots, dest)

      expect(staged.map(s => s.name)).toEqual(['boundary-ok'])
      expect(await fs.readdir(path.join(dest, 'boundary-ok', 'sub'))).toEqual(['real.md'])
    })

    it('refuses a hard-linked SKILL.md and a hard-linked file inside a skill, keeping the rest', async () => {
      const override = await boundaryOverride()
      const outside = path.join(dir, 'outside-hard')
      await fs.mkdir(outside, { recursive: true })
      await fs.writeFile(path.join(outside, 'secret.md'), 'secret')
      await fs.writeFile(path.join(outside, 'SKILL.md'), '---\nname: Stolen\n---\n')

      await fs.mkdir(path.join(override.dir, 'skills', 'ok'), { recursive: true })
      await fs.writeFile(path.join(override.dir, 'skills', 'ok', 'SKILL.md'), '---\nname: Ok\n---\n')
      await fs.writeFile(path.join(override.dir, 'skills', 'ok', 'real.md'), 'real')
      await fs.link(path.join(outside, 'secret.md'), path.join(override.dir, 'skills', 'ok', 'secret.md'))
      await fs.mkdir(path.join(override.dir, 'skills', 'stolen'), { recursive: true })
      await fs.link(path.join(outside, 'SKILL.md'), path.join(override.dir, 'skills', 'stolen', 'SKILL.md'))

      const roots = skillRootsFor({ platformDir: path.join(dir, 'platform'), orgDir: null, agentDir: path.join(dir, 'agent') }, override)
      const dest = path.join(dir, 'out')
      const staged = await stageSkills(roots, dest)

      expect(staged.map(s => s.name)).toEqual(['boundary-ok'])
      expect((await fs.readdir(path.join(dest, 'boundary-ok'))).sort()).toEqual(['SKILL.md', 'real.md'])
    })

    it('warns when a skill\'s own SKILL.md is refused for being a symlink', async () => {
      const override = await boundaryOverride()
      const skillDir = path.join(override.dir, 'skills', 'linked-skill')
      await fs.mkdir(skillDir, { recursive: true })
      const realMd = path.join(dir, 'real-SKILL.md')
      await fs.writeFile(realMd, '---\nname: Real\n---\n')
      await fs.symlink(realMd, path.join(skillDir, 'SKILL.md'))

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      try {
        const roots = skillRootsFor({ platformDir: path.join(dir, 'platform'), orgDir: null, agentDir: path.join(dir, 'agent') }, override)
        const staged = await stageSkills(roots, path.join(dir, 'out'))
        expect(staged).toEqual([])
        expect(warnSpy.mock.calls.some(args => String(args[0]).includes('refused a symlink'))).toBe(true)
      } finally {
        warnSpy.mockRestore()
      }
    })

    // chmod 0o000 blocks read access for anyone but root — skip under a root
    // test runner (some CI containers), where it wouldn't actually be unreadable.
    it.skipIf(typeof process.getuid === 'function' && process.getuid() === 0)('refuses an unreadable file, warns, and keeps staging the rest of the tree', async () => {
      const override = await boundaryOverride()
      await fs.mkdir(path.join(override.dir, 'skills', 'ok'), { recursive: true })
      await fs.writeFile(path.join(override.dir, 'skills', 'ok', 'SKILL.md'), '---\nname: Ok\n---\n')
      const blocked = path.join(override.dir, 'skills', 'ok', 'blocked.md')
      await fs.writeFile(blocked, 'secret')
      await fs.chmod(blocked, 0o000)

      const roots = skillRootsFor({ platformDir: path.join(dir, 'platform'), orgDir: null, agentDir: path.join(dir, 'agent') }, override)
      const dest = path.join(dir, 'out')
      try {
        const staged = await stageSkills(roots, dest)
        expect(staged.map(s => s.name)).toEqual(['boundary-ok'])
        expect(await fs.readdir(path.join(dest, 'boundary-ok'))).toEqual(['SKILL.md'])
      } finally {
        await fs.chmod(blocked, 0o644)
      }
    })
  })

  describe('bounds on the boundary tree', () => {
    it('truncates past the entry cap, keeping earlier entries staged', async () => {
      const override = await boundaryOverride()
      const skillDir = path.join(override.dir, 'skills', 'big')
      await fs.mkdir(skillDir, { recursive: true })
      await fs.writeFile(path.join(skillDir, 'SKILL.md'), '---\nname: Big\n---\n')
      const extra = MAX_BOUNDARY_ENTRIES + 5
      await Promise.all(Array.from({ length: extra }, (_, i) =>
        fs.writeFile(path.join(skillDir, `f${i}.txt`), 'x'),
      ))

      const roots = skillRootsFor({ platformDir: path.join(dir, 'platform'), orgDir: null, agentDir: path.join(dir, 'agent') }, override)
      const dest = path.join(dir, 'out')
      await stageSkills(roots, dest)

      const staged = await fs.readdir(path.join(dest, 'boundary-big'))
      // The skill folder and its SKILL.md take two entries before the copy, and
      // the copy leaves SKILL.md out — so the budget bounds the staged tree.
      expect(staged.length).toBeLessThanOrEqual(MAX_BOUNDARY_ENTRIES + 1)
      expect(staged.length).toBeLessThan(extra + 1)
    }, 20000)

    // Size is checked from fstat BEFORE reading — an oversized file must
    // never be loaded into memory just to be discarded.
    it('refuses an oversized file by its fstat size alone, without loading it', async () => {
      const override = await boundaryOverride()
      const skillDir = path.join(override.dir, 'skills', 'big')
      await fs.mkdir(skillDir, { recursive: true })
      await fs.writeFile(path.join(skillDir, 'SKILL.md'), '---\nname: Big\n---\n')
      await fs.writeFile(path.join(skillDir, 'small.txt'), 'kept')
      // A single file already over the WHOLE budget is refused regardless of
      // directory read order (unlike two files whose combined size only
      // exceeds the budget together, where whichever is read first would win).
      await fs.writeFile(path.join(skillDir, 'toobig.bin'), Buffer.alloc(MAX_BOUNDARY_BYTES + 1024))

      const roots = skillRootsFor({ platformDir: path.join(dir, 'platform'), orgDir: null, agentDir: path.join(dir, 'agent') }, override)
      const dest = path.join(dir, 'out')
      const start = Date.now()
      await stageSkills(roots, dest)
      const elapsedMs = Date.now() - start

      const staged = await fs.readdir(path.join(dest, 'boundary-big'))
      expect(staged).not.toContain('toobig.bin')
      expect(staged).toContain('small.txt')
      // Weak corroborating signal, not a tight timing assertion: a size check
      // via fstat alone is near-instant; reading 16+MB into memory first only
      // to discard it would be measurably slower even on a loaded CI runner.
      expect(elapsedMs).toBeLessThan(2000)
    })

    it('keeps many skills, each with a large SKILL.md, within the byte cap', async () => {
      const override = await boundaryOverride()
      // Each just over a third of the cap, and each SKILL.md charged once — so
      // exactly two fit, whichever order they're read in (unlike the
      // single-file test above, this drains the budget across several skills).
      const skillSize = Math.floor(MAX_BOUNDARY_BYTES / 3) + 1024
      const slugs = ['one', 'two', 'three', 'four']
      for (const slug of slugs) {
        const skillDir = path.join(override.dir, 'skills', slug)
        await fs.mkdir(skillDir, { recursive: true })
        await fs.writeFile(path.join(skillDir, 'SKILL.md'), `---\nname: ${slug}\n---\n${'x'.repeat(skillSize)}`)
      }

      const roots = skillRootsFor({ platformDir: path.join(dir, 'platform'), orgDir: null, agentDir: path.join(dir, 'agent') }, override)
      const dest = path.join(dir, 'out')
      const staged = await stageSkills(roots, dest)

      const boundaryStaged = staged.filter(s => s.source === 'boundary')
      expect(boundaryStaged).toHaveLength(2)
      let total = 0
      for (const s of boundaryStaged) total += (await fs.stat(path.join(dest, s.name, 'SKILL.md'))).size
      expect(total).toBeLessThanOrEqual(MAX_BOUNDARY_BYTES)
    })

    it('charges folders that are not valid skill names against the entry cap, and warns once', async () => {
      const override = await boundaryOverride()
      const skills = path.join(override.dir, 'skills')
      await fs.mkdir(skills, { recursive: true })
      await Promise.all(Array.from({ length: MAX_BOUNDARY_ENTRIES }, (_, i) =>
        fs.mkdir(path.join(skills, `aa_${String(i).padStart(4, '0')}`)),
      ))
      await fs.mkdir(path.join(skills, 'zz'))
      await fs.writeFile(path.join(skills, 'zz', 'SKILL.md'), '---\nname: Zz\n---\n')

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      try {
        const roots = skillRootsFor({ platformDir: path.join(dir, 'platform'), orgDir: null, agentDir: path.join(dir, 'agent') }, override)
        const staged = await stageSkills(roots, path.join(dir, 'out'))
        expect(staged).toEqual([])
        expect(warnSpy.mock.calls.filter(args => /valid skill name/.test(String(args[0])))).toHaveLength(1)
      } finally {
        warnSpy.mockRestore()
      }
    }, 20000)

    it('stops recursing past the depth cap', async () => {
      const override = await boundaryOverride()
      let cursor = path.join(override.dir, 'skills', 'deep')
      await fs.mkdir(cursor, { recursive: true })
      await fs.writeFile(path.join(cursor, 'SKILL.md'), '---\nname: Deep\n---\n')
      for (let i = 0; i < MAX_BOUNDARY_DEPTH + 3; i++) {
        cursor = path.join(cursor, `lvl${i}`)
        await fs.mkdir(cursor, { recursive: true })
      }
      await fs.writeFile(path.join(cursor, 'bottom.md'), 'bottom')

      const roots = skillRootsFor({ platformDir: path.join(dir, 'platform'), orgDir: null, agentDir: path.join(dir, 'agent') }, override)
      const dest = path.join(dir, 'out')
      await stageSkills(roots, dest)

      // Walk the staged tree — 'bottom.md', past the depth cap, must not appear anywhere.
      async function collect(base: string): Promise<string[]> {
        const out: string[] = []
        for (const e of await fs.readdir(base, { withFileTypes: true })) {
          const p = path.join(base, e.name)
          if (e.isDirectory()) out.push(...await collect(p))
          else out.push(p)
        }
        return out
      }
      const files = await collect(path.join(dest, 'boundary-deep'))
      expect(files.some(f => f.endsWith('bottom.md'))).toBe(false)
    })
  })

  describe('per-skill staging never aborts the run', () => {
    // mode 0311: execute-only, for owner, group and other alike — SKILL.md is
    // still openable by its exact name (traversal needs only execute on the
    // containing directory), but the directory itself cannot be listed
    // (readdir needs read). Root bypasses this, so skip under a root runner.
    it.skipIf(typeof process.getuid === 'function' && process.getuid() === 0)('stages a SKILL.md-only skill whose directory is unlistable (mode 0311)', async () => {
      const override = await boundaryOverride()
      const skillDir = path.join(override.dir, 'skills', 'locked')
      await fs.mkdir(skillDir, { recursive: true })
      await fs.writeFile(path.join(skillDir, 'SKILL.md'), '---\nname: Locked\n---\n')
      await fs.writeFile(path.join(skillDir, 'extra.md'), 'extra')
      await fs.chmod(skillDir, 0o311)

      const roots = skillRootsFor({ platformDir: path.join(dir, 'platform'), orgDir: null, agentDir: path.join(dir, 'agent') }, override)
      const dest = path.join(dir, 'out')
      try {
        const staged = await stageSkills(roots, dest)
        expect(staged.map(s => s.name)).toEqual(['boundary-locked'])
        // copyTree could not list the directory, so only the explicit,
        // unconditional SKILL.md rewrite landed in dest — never a crash, and
        // never a directory left half-created (finding 3's core claim).
        expect(await fs.readdir(path.join(dest, 'boundary-locked'))).toEqual(['SKILL.md'])
      } finally {
        await fs.chmod(skillDir, 0o755)
      }
    })

    it('does not fail the run when a skill directory is swapped away between its SKILL.md read and copyTree', async () => {
      const override = await boundaryOverride()
      const skillDir = path.join(override.dir, 'skills', 'vanishing')
      await fs.mkdir(skillDir, { recursive: true })
      await fs.writeFile(path.join(skillDir, 'SKILL.md'), '---\nname: Vanishing\n---\n')
      await fs.writeFile(path.join(skillDir, 'extra.md'), 'extra')

      const dest = path.join(dir, 'out')
      const realMkdir = fs.mkdir.bind(fs)
      const spy = vi.spyOn(fs, 'mkdir').mockImplementation(async (target: any, options?: any) => {
        const result = await realMkdir(target, options)
        // stageSkills creates `dest` at exactly this point — right after
        // reading SKILL.md and right before calling copyTree. Swap the
        // skill's SOURCE directory out from under it here, deterministically
        // simulating the race the review describes rather than hoping a
        // timing-based race lands.
        if (typeof target === 'string' && target === path.join(dest, 'boundary-vanishing')) {
          await fs.rm(skillDir, { recursive: true, force: true })
          spy.mockRestore()
        }
        return result
      })

      const roots = skillRootsFor({ platformDir: path.join(dir, 'platform'), orgDir: null, agentDir: path.join(dir, 'agent') }, override)
      const staged = await stageSkills(roots, dest)

      expect(staged.map(s => s.name)).toEqual(['boundary-vanishing'])
      expect(await fs.readdir(path.join(dest, 'boundary-vanishing'))).toEqual(['SKILL.md'])
    })
  })
})
