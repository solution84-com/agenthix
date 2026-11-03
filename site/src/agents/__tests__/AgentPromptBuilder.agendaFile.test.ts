/**
 * A person's agenda sits in a folder the run can write, so the file the prompt
 * builder reads is hostile: a link, a device, a second name for another file,
 * or a huge file is left out of the prompt, never read.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { AgentPromptBuilder } from '../AgentPromptBuilder'

const agent = { id: 'a1', name: 'Scout', handle: 'scout', role: 'researcher' }
const content = { instructions: '# Scout', org: '' }
const visiblePath = '/projects/atlas/members/u1/agenda.md'
const SECRET = 'SITE_SECRET=do-not-read'

let root: string
let outside: string
let hostPath: string
beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'site-root-'))
  outside = await fs.mkdtemp(path.join(os.tmpdir(), 'site-outside-'))
  process.env.SITE_ROOT = root
  hostPath = path.join(root, 'projects', 'p1', 'members', 'u1', 'agenda.md')
  await fs.mkdir(path.dirname(hostPath), { recursive: true })
  await fs.writeFile(path.join(outside, 'secret'), SECRET)
})
afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true })
  await fs.rm(outside, { recursive: true, force: true })
})

async function agendaSection(): Promise<string> {
  const { systemPrompt } = await new AgentPromptBuilder(agent, content).buildChatPrompt({ agenda: { hostPath, visiblePath } })
  return systemPrompt.split('\n\n---\n\n').find(s => s.startsWith('## Agenda'))!
}

describe('the agenda file is read only when it is a plain file of its own', () => {
  it('reads an ordinary agenda', async () => {
    await fs.writeFile(hostPath, '## Now\n\n- Confirm the org name')
    expect(await agendaSection()).toContain('- Confirm the org name')
  })

  it('leaves out an agenda that is a link to a file outside', async () => {
    await fs.symlink(path.join(outside, 'secret'), hostPath)
    const section = await agendaSection()
    expect(section).not.toContain(SECRET)
    expect(section).toContain('_Nothing recorded yet._')
  })

  it('leaves out an agenda whose folder is a link to a folder outside', async () => {
    const folder = path.dirname(hostPath)
    await fs.rm(folder, { recursive: true })
    await fs.writeFile(path.join(outside, 'agenda.md'), SECRET)
    await fs.symlink(outside, folder)
    expect(await agendaSection()).not.toContain(SECRET)
  })

  it('leaves out an agenda that is a hard link to another file', async () => {
    await fs.link(path.join(outside, 'secret'), hostPath).catch(async () => {
      // A temporary folder on another device cannot be hard-linked to; make the other name beside it instead.
      await fs.writeFile(path.join(root, 'other'), SECRET)
      await fs.link(path.join(root, 'other'), hostPath)
    })
    expect(await agendaSection()).not.toContain(SECRET)
  })

  it('never reads a link to a device', async () => {
    await fs.symlink('/dev/zero', hostPath)
    expect(await agendaSection()).toContain('_Nothing recorded yet._')
  })

  it('leaves out an agenda larger than the limit', async () => {
    await fs.writeFile(hostPath, `${SECRET}\n${'x'.repeat(1024 * 1024)}`)
    expect(await agendaSection()).not.toContain(SECRET)
  })
})
