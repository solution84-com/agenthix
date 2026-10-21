import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import type { ToolContext, ToolResult } from '@opencode-ai/plugin/tool'
import { InstructionFiles } from '../files/instructions'
import { readTool } from '../files/readTool'
import { editTool, writeTool } from '../files/writeTools'
import { tempDir, testFdPaths, toolContext } from './helpers'

type Tool = { execute(args: never, ctx: ToolContext): Promise<ToolResult> }
const run = (tool: Tool, args: unknown, ctx: ToolContext) => tool.execute(args as never, ctx) as Promise<Exclude<ToolResult, string>>

function setup() {
  const root = tempDir()
  const p = path.join(root, 'p')
  fs.mkdirSync(path.join(p, 'docs'), { recursive: true })
  fs.mkdirSync(path.join(root, 'home'))
  fs.writeFileSync(path.join(root, 'home', 'secret.txt'), 'TOPSECRET')
  const sys = testFdPaths()
  return {
    root, p, sys, ctx: toolContext(p),
    read: readTool(sys, new InstructionFiles(sys, { OPENCODE_DISABLE_CLAUDE_CODE: '1' })),
    write: writeTool(sys),
    edit: editTool(sys),
  }
}

describe('read', () => {
  it("answers as OpenCode's read does, lines numbered, and asks OpenCode's read permission", async () => {
    const { p, ctx, read } = setup()
    fs.writeFileSync(path.join(p, 'a.txt'), 'one\r\ntwo\rthree\n')
    const res = await run(read, { filePath: path.join(p, 'a.txt') }, ctx)
    expect(res.output).toBe(`<path>${p}/a.txt</path>\n<type>file</type>\n<content>\n1: one\n2: two\n3: three\n\n(End of file - total 3 lines)\n</content>`)
    expect(res.title).toBe('a.txt')
    expect(ctx.asked).toEqual([{ permission: 'read', patterns: ['a.txt'] }])
  })

  it('reads from an offset and says where to continue', async () => {
    const { p, ctx, read } = setup()
    fs.writeFileSync(path.join(p, 'n.txt'), Array.from({ length: 10 }, (_, i) => `l${i + 1}`).join('\n'))
    const res = await run(read, { filePath: 'n.txt', offset: 4, limit: 2 }, ctx)
    expect(res.output).toContain('4: l4\n5: l5\n\n(Showing lines 4-5 of 10. Use offset=6 to continue.)')
  })

  it('lists a folder, and suggests near names for a missing file', async () => {
    const { p, ctx, read } = setup()
    fs.writeFileSync(path.join(p, 'notes.txt'), 'x')
    const res = await run(read, { filePath: p }, ctx)
    expect(res.output).toBe(`<path>${p}</path>\n<type>directory</type>\n<entries>\ndocs/\nnotes.txt\n\n(2 entries)\n</entries>`)
    await expect(run(read, { filePath: path.join(p, 'notes') }, ctx)).rejects.toThrow(`File not found: ${p}/notes\n\nDid you mean one of these?\n${p}/notes.txt`)
  })

  it('refuses a binary file, and returns an image as an attachment', async () => {
    const { p, ctx, read } = setup()
    fs.writeFileSync(path.join(p, 'b.dat'), 'x')
    await expect(run(read, { filePath: path.join(p, 'b.dat') }, ctx)).rejects.toThrow(`Cannot read binary file: ${p}/b.dat`)
    fs.writeFileSync(path.join(p, 'i.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2]))
    const res = await run(read, { filePath: path.join(p, 'i.png') }, ctx)
    expect(res.output).toBe('Image read successfully')
    expect(res.attachments?.[0]).toMatchObject({ type: 'file', mime: 'image/png' })
  })

  it('never follows a link into another folder', async () => {
    const { p, root, ctx, read } = setup()
    fs.symlinkSync(path.join(root, 'home', 'secret.txt'), path.join(p, 'leak.txt'))
    await expect(run(read, { filePath: path.join(p, 'leak.txt') }, ctx)).rejects.toThrow('changed after it was checked')
  })

  it("attaches a folder's AGENTS.md once per session, and never a planted link", async () => {
    const { p, root, ctx, read } = setup()
    fs.writeFileSync(path.join(p, 'docs', 'AGENTS.md'), 'Be brief.')
    fs.writeFileSync(path.join(p, 'docs', 'x.md'), 'x')
    const first = await run(read, { filePath: path.join(p, 'docs', 'x.md') }, ctx)
    expect(first.output).toContain(`<system-reminder>\nInstructions from: ${p}/docs/AGENTS.md\nBe brief.\n</system-reminder>`)
    const again = await run(read, { filePath: path.join(p, 'docs', 'x.md') }, ctx)
    expect(again.output).not.toContain('system-reminder')

    fs.mkdirSync(path.join(p, 'evil'))
    fs.symlinkSync(path.join(root, 'home', 'secret.txt'), path.join(p, 'evil', 'AGENTS.md'))
    fs.writeFileSync(path.join(p, 'evil', 'y.md'), 'y')
    const planted = await run(read, { filePath: path.join(p, 'evil', 'y.md') }, ctx)
    expect(planted.output).not.toContain('TOPSECRET')
  })

  it("answers invalid arguments with OpenCode's message", async () => {
    const { ctx, read } = setup()
    await expect(run(read, { filePath: 3 }, ctx)).rejects.toThrow(/^The read tool was called with invalid arguments: .*\nPlease rewrite the input so it satisfies the expected schema\.$/s)
  })
})

describe('write', () => {
  it('creates a file with its folders, and keeps an existing byte-order mark', async () => {
    const { p, ctx, write } = setup()
    const res = await run(write, { filePath: path.join(p, 'new', 'deep', 'f.txt'), content: 'made' }, ctx)
    expect(res.output).toBe('Wrote file successfully.')
    expect(res.metadata).toMatchObject({ exists: false })
    expect(fs.readFileSync(path.join(p, 'new', 'deep', 'f.txt'), 'utf-8')).toBe('made')
    expect(ctx.asked).toEqual([{ permission: 'edit', patterns: ['new/deep/f.txt'] }])

    fs.writeFileSync(path.join(p, 'bom.txt'), '﻿old')
    await run(write, { filePath: path.join(p, 'bom.txt'), content: 'new' }, ctx)
    expect(fs.readFileSync(path.join(p, 'bom.txt'), 'utf-8')).toBe('﻿new')
  })

  it('never writes through a link', async () => {
    const { p, root, ctx, write } = setup()
    fs.symlinkSync(path.join(root, 'home', 'secret.txt'), path.join(p, 'w.txt'))
    await expect(run(write, { filePath: path.join(p, 'w.txt'), content: 'pwned' }, ctx)).rejects.toThrow('changed after it was checked')
    expect(fs.readFileSync(path.join(root, 'home', 'secret.txt'), 'utf-8')).toBe('TOPSECRET')
  })
})

describe('edit', () => {
  it('replaces with OpenCode matching, keeping line endings', async () => {
    const { p, ctx, edit } = setup()
    fs.writeFileSync(path.join(p, 'e.txt'), 'alpha\r\n  beta\r\ngamma\r\n')
    const res = await run(edit, { filePath: path.join(p, 'e.txt'), oldString: 'beta\ngamma', newString: 'BETA\nGAMMA' }, ctx)
    expect(res.output).toBe('Edit applied successfully.')
    expect(fs.readFileSync(path.join(p, 'e.txt'), 'utf-8')).toBe('alpha\r\n  BETA\r\nGAMMA\r\n')
  })

  it("gives OpenCode's messages when nothing or too much matches", async () => {
    const { p, ctx, edit } = setup()
    fs.writeFileSync(path.join(p, 'e.txt'), 'x x')
    await expect(run(edit, { filePath: path.join(p, 'e.txt'), oldString: 'y', newString: 'z' }, ctx))
      .rejects.toThrow('Could not find oldString in the file. It must match exactly, including whitespace, indentation, and line endings.')
    await expect(run(edit, { filePath: path.join(p, 'e.txt'), oldString: 'x', newString: 'z' }, ctx))
      .rejects.toThrow('Found multiple matches for oldString. Provide more surrounding context to make the match unique.')
    await expect(run(edit, { filePath: path.join(p, 'e.txt'), oldString: 'x', newString: 'x' }, ctx))
      .rejects.toThrow('No changes to apply: oldString and newString are identical.')
    await run(edit, { filePath: path.join(p, 'e.txt'), oldString: 'x', newString: 'z', replaceAll: true }, ctx)
    expect(fs.readFileSync(path.join(p, 'e.txt'), 'utf-8')).toBe('z z')
  })

  it('creates a new file from an empty oldString, and refuses one for an existing file', async () => {
    const { p, ctx, edit } = setup()
    await run(edit, { filePath: path.join(p, 'c.txt'), oldString: '', newString: 'fresh' }, ctx)
    expect(fs.readFileSync(path.join(p, 'c.txt'), 'utf-8')).toBe('fresh')
    await expect(run(edit, { filePath: path.join(p, 'c.txt'), oldString: '', newString: 'again' }, ctx))
      .rejects.toThrow('oldString cannot be empty when editing an existing file.')
    await expect(run(edit, { filePath: path.join(p, 'missing.txt'), oldString: 'a', newString: 'b' }, ctx))
      .rejects.toThrow(`File ${p}/missing.txt not found`)
  })

  it('never edits through a link', async () => {
    const { p, root, ctx, edit } = setup()
    fs.symlinkSync(path.join(root, 'home', 'secret.txt'), path.join(p, 'l.txt'))
    await expect(run(edit, { filePath: path.join(p, 'l.txt'), oldString: 'TOPSECRET', newString: 'x' }, ctx)).rejects.toThrow('changed after it was checked')
    expect(fs.readFileSync(path.join(root, 'home', 'secret.txt'), 'utf-8')).toBe('TOPSECRET')
  })
})

describe("a file-system failure, in OpenCode's words", () => {
  it('read: a file it may not open, and a path through a file', async () => {
    const { p, ctx, read } = setup()
    fs.writeFileSync(path.join(p, 'locked.txt'), 'x', { mode: 0o000 })
    fs.writeFileSync(path.join(p, 'a.txt'), 'x')
    await expect(run(read, { filePath: path.join(p, 'locked.txt') }, ctx)).rejects.toThrow(new Error(`PermissionDenied: FileSystem.open (${p}/locked.txt)`))
    await expect(run(read, { filePath: path.join(p, 'a.txt', 'x') }, ctx)).rejects.toThrow(new Error(`BadResource: FileSystem.stat (${p}/a.txt/x)`))
  })

  it('write: a folder, a path through a file, and a read-only file', async () => {
    const { p, ctx, write } = setup()
    fs.writeFileSync(path.join(p, 'a.txt'), 'old')
    fs.writeFileSync(path.join(p, 'ro.txt'), 'old', { mode: 0o444 })
    await expect(run(write, { filePath: path.join(p, 'docs'), content: 'x' }, ctx)).rejects.toThrow(new Error(`BadResource: FileSystem.readFile (${p}/docs)`))
    await expect(run(write, { filePath: path.join(p, 'a.txt', 'x'), content: 'x' }, ctx)).rejects.toThrow(new Error(`BadResource: FileSystem.writeFile (${p}/a.txt/x)`))
    await expect(run(write, { filePath: path.join(p, 'ro.txt'), content: 'new' }, ctx)).rejects.toThrow(new Error(`PermissionDenied: FileSystem.writeFile (${p}/ro.txt)`))
    expect(fs.readFileSync(path.join(p, 'ro.txt'), 'utf-8')).toBe('old')
  })

  it('edit: a read-only file fails at the write, after the match', async () => {
    const { p, ctx, edit } = setup()
    fs.writeFileSync(path.join(p, 'ro.txt'), 'one two', { mode: 0o444 })
    await expect(run(edit, { filePath: path.join(p, 'ro.txt'), oldString: 'three', newString: 'x' }, ctx))
      .rejects.toThrow('Could not find oldString in the file.')
    await expect(run(edit, { filePath: path.join(p, 'ro.txt'), oldString: 'two', newString: 'x' }, ctx))
      .rejects.toThrow(new Error(`PermissionDenied: FileSystem.writeFile (${p}/ro.txt)`))
    expect(fs.readFileSync(path.join(p, 'ro.txt'), 'utf-8')).toBe('one two')
  })
})
