/**
 * `AGENTS.md` at the top of a place's files is that place's instructions for
 * every agent working there, read into every run's prompt. The file sits on
 * disk every agent in the place can write, so it is read only as a real file
 * in a real `files/` folder: no link at the file, and none standing in for the
 * folder.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { readPlaceInstructions, PLACE_INSTRUCTIONS_MAX_BYTES } from '../placeInstructions'
import { getFilesDir } from '../../server/storage/paths'

const project = { ownerType: 'project' as const, ownerId: 'p1' }
const person = { ownerType: 'user' as const, ownerId: 'u1' }

let root: string
let outside: string
beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'site-root-'))
  outside = await fs.mkdtemp(path.join(os.tmpdir(), 'outside-'))
  process.env.SITE_ROOT = root
  await fs.writeFile(path.join(outside, 'AGENTS.md'), 'exfiltrated')
})
afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true })
  await fs.rm(outside, { recursive: true, force: true })
})

async function writeInstructions(owner: typeof project | typeof person, text: string): Promise<string> {
  const home = getFilesDir(owner.ownerType, owner.ownerId)
  await fs.mkdir(home, { recursive: true })
  await fs.writeFile(path.join(home, 'AGENTS.md'), text)
  return home
}

describe("a place's AGENTS.md @SC-781", () => {
  it("reads a project's and a person's own, trimmed", async () => {
    await writeInstructions(project, '\nUse British spelling.\n\n')
    await writeInstructions(person, 'Keep answers short.')
    expect(await readPlaceInstructions(project)).toBe('Use British spelling.')
    expect(await readPlaceInstructions(person)).toBe('Keep answers short.')
  })

  it('is nothing when the file is absent or empty', async () => {
    expect(await readPlaceInstructions(project)).toBeNull()
    await writeInstructions(project, '  \n')
    expect(await readPlaceInstructions(project)).toBeNull()
  })

  it('does not read PROJECT.md, the name it took over from', async () => {
    const home = getFilesDir('project', 'p1')
    await fs.mkdir(home, { recursive: true })
    await fs.writeFile(path.join(home, 'PROJECT.md'), 'Vision: old')
    expect(await readPlaceInstructions(project)).toBeNull()
  })

  it('refuses a link at the file, even one pointing outside the place', async () => {
    const home = getFilesDir('project', 'p1')
    await fs.mkdir(home, { recursive: true })
    await fs.symlink(path.join(outside, 'AGENTS.md'), path.join(home, 'AGENTS.md'))
    expect(await readPlaceInstructions(project)).toBeNull()
  })

  it('refuses a files folder that has been replaced by a link', async () => {
    const home = getFilesDir('project', 'p1')
    await fs.mkdir(path.dirname(home), { recursive: true })
    await fs.symlink(outside, home)
    expect(await readPlaceInstructions(project)).toBeNull()
  })

  it('leaves out a file over the bound rather than bloating every prompt', async () => {
    await writeInstructions(project, 'x'.repeat(PLACE_INSTRUCTIONS_MAX_BYTES + 1))
    expect(await readPlaceInstructions(project)).toBeNull()
  })
})
