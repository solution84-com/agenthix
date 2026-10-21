import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import type { ToolContext, ToolResult } from '@opencode-ai/plugin/tool'
import { applyPatchTool } from '../files/applyPatchTool'
import { tempDir, testFdPaths, toolContext } from './helpers'

const patch = (...lines: string[]) => ['*** Begin Patch', ...lines, '*** End Patch'].join('\n')

function setup() {
  const root = tempDir()
  const p = path.join(root, 'p')
  const home = path.join(root, 'home')
  fs.mkdirSync(path.join(p, 'src'), { recursive: true })
  fs.mkdirSync(home)
  fs.writeFileSync(path.join(home, 'secret.txt'), 'TOPSECRET\n')
  const ctx = toolContext(p)
  const tool = applyPatchTool(testFdPaths())
  const apply = (patchText: unknown, c: ToolContext = ctx) =>
    tool.execute({ patchText } as never, c) as Promise<Exclude<ToolResult, string>>
  return { root, p, home, ctx, apply }
}

const read = (p: string) => fs.readFileSync(p, 'utf-8')
const homeUnchanged = (home: string) => expect(fs.readdirSync(home).sort()).toEqual(['secret.txt'])

describe('apply_patch', () => {
  it("adds, updates, moves and deletes in one patch, and answers in OpenCode's words", async () => {
    const { p, ctx, apply } = setup()
    fs.writeFileSync(path.join(p, 'src', 'app.py'), 'def greet():\n    print("Hi")\n')
    fs.writeFileSync(path.join(p, 'keep.txt'), 'one\ntwo\n')
    fs.writeFileSync(path.join(p, 'obsolete.txt'), 'bye\n')
    const res = await apply(patch(
      '*** Add File: new/deep/hello.txt', '+Hello', '+world',
      '*** Update File: keep.txt', '@@', '-two', '+TWO',
      '*** Update File: src/app.py', '*** Move to: src/main.py', '@@ def greet():', '-    print("Hi")', '+    print("Hello")',
      '*** Delete File: obsolete.txt',
    ))
    const summary = 'Success. Updated the following files:\nA new/deep/hello.txt\nM keep.txt\nM src/main.py\nD obsolete.txt'
    expect(res.output).toBe(summary)
    expect(res.title).toBe(summary)
    expect(read(path.join(p, 'new', 'deep', 'hello.txt'))).toBe('Hello\nworld\n')
    expect(read(path.join(p, 'keep.txt'))).toBe('one\nTWO\n')
    expect(read(path.join(p, 'src', 'main.py'))).toBe('def greet():\n    print("Hello")\n')
    expect(fs.existsSync(path.join(p, 'src', 'app.py'))).toBe(false)
    expect(fs.existsSync(path.join(p, 'obsolete.txt'))).toBe(false)
    expect(ctx.asked).toEqual([{ permission: 'edit', patterns: ['new/deep/hello.txt', 'keep.txt', 'src/app.py', 'obsolete.txt'] }])
  })

  it('keeps a byte-order mark, and asks for a folder outside the project', async () => {
    const { p, root, ctx, apply } = setup()
    fs.writeFileSync(path.join(p, 'bom.txt'), '﻿a\nb\n')
    fs.mkdirSync(path.join(root, 'elsewhere'))
    await apply(patch('*** Update File: bom.txt', '@@', '-b', '+B', `*** Add File: ${root}/elsewhere/x.txt`, '+x'))
    expect(read(path.join(p, 'bom.txt'))).toBe('﻿a\nB\n')
    expect(ctx.asked[0]).toEqual({ permission: 'external_directory', patterns: [`${root}/elsewhere/*`] })
  })

  it("fails with OpenCode's messages, changing nothing", async () => {
    const { p, apply } = setup()
    fs.writeFileSync(path.join(p, 'a.txt'), 'a\n')
    await expect(apply('')).rejects.toThrow('patchText is required')
    await expect(apply(5)).rejects.toThrow('The apply_patch tool was called with invalid arguments')
    await expect(apply('*** Add File: x\n+y')).rejects.toThrow('apply_patch verification failed: Error: Invalid patch format: missing Begin/End markers')
    await expect(apply('*** Begin Patch\n*** End Patch')).rejects.toThrow('patch rejected: empty patch')
    await expect(apply('*** Begin Patch\nnothing\n*** End Patch')).rejects.toThrow('apply_patch verification failed: no hunks found')
    await expect(apply(patch('*** Add File: made.txt', '+m', '*** Update File: gone.txt', '@@', '-a', '+b')))
      .rejects.toThrow(`apply_patch verification failed: Failed to read file to update: ${p}/gone.txt`)
    await expect(apply(patch('*** Update File: src', '@@', '-a', '+b')))
      .rejects.toThrow(`apply_patch verification failed: Failed to read file to update: ${p}/src`)
    await expect(apply(patch('*** Update File: a.txt', '@@', '-zzz', '+b')))
      .rejects.toThrow(`apply_patch verification failed: Error: Failed to find expected lines in ${p}/a.txt:\nzzz`)
    await expect(apply(patch('*** Delete File: gone.txt')))
      .rejects.toThrow(new Error(`apply_patch verification failed: NotFound: FileSystem.readFile (${p}/gone.txt)`))
    fs.writeFileSync(path.join(p, 'locked.txt'), 'a\n', { mode: 0o444 })
    await expect(apply(patch('*** Update File: locked.txt', '@@', '-a', '+b')))
      .rejects.toThrow(new Error(`PermissionDenied: FileSystem.writeFile (${p}/locked.txt)`))
    expect(fs.existsSync(path.join(p, 'made.txt'))).toBe(false)
    expect(read(path.join(p, 'a.txt'))).toBe('a\n')
  })

  it('stops at a file in the way of a folder, keeping what it already wrote, as OpenCode does', async () => {
    const { p, apply } = setup()
    fs.writeFileSync(path.join(p, 'blocker'), 'a file\n')
    await expect(apply(patch('*** Add File: first.txt', '+first', '*** Add File: blocker/second.txt', '+second', '*** Add File: third.txt', '+third')))
      .rejects.toThrow(new Error(`BadResource: FileSystem.writeFile (${p}/blocker/second.txt)`))
    expect(read(path.join(p, 'first.txt'))).toBe('first\n')
    expect(fs.existsSync(path.join(p, 'third.txt'))).toBe(false)
  })

  it('never reads, writes, moves or deletes through a link into the harness home, and deletes a link itself', async () => {
    const { p, home, apply } = setup()
    fs.symlinkSync(home, path.join(p, 'dir'))
    fs.symlinkSync(path.join(home, 'secret.txt'), path.join(p, 'link.txt'))
    fs.writeFileSync(path.join(p, 'ok.txt'), 'ok\n')
    const refused = [
      patch('*** Add File: dir/planted.txt', '+pwned'),
      patch('*** Add File: link.txt', '+pwned'),
      patch('*** Update File: dir/secret.txt', '@@', '-TOPSECRET', '+pwned'),
      patch('*** Update File: link.txt', '@@', '-TOPSECRET', '+pwned'),
      patch('*** Delete File: dir/secret.txt'),
      patch('*** Update File: ok.txt', '*** Move to: dir/moved.txt', '@@', '-ok', '+moved'),
    ]
    for (const text of refused) await expect(apply(text)).rejects.toThrow('changed after it was checked')
    expect(read(path.join(p, 'ok.txt'))).toBe('ok\n')

    expect((await apply(patch('*** Delete File: link.txt'))).output).toBe('Success. Updated the following files:\nD link.txt')
    expect(fs.existsSync(path.join(p, 'link.txt'))).toBe(false)
    expect(read(path.join(home, 'secret.txt'))).toBe('TOPSECRET\n')
    homeUnchanged(home)
  })

  it('never touches /proc', async () => {
    const { apply } = setup()
    await expect(apply(patch('*** Update File: /proc/self/environ', '@@', '-a', '+b'))).rejects.toThrow('changed after it was checked')
    await expect(apply(patch('*** Add File: /proc/self/planted', '+x'))).rejects.toThrow('changed after it was checked')
    await expect(apply(patch('*** Delete File: /proc/self/environ'))).rejects.toThrow('changed after it was checked')
  })

  it('refuses a folder swapped for a link after the patch was worked out, before it writes or removes', async () => {
    const { p, home, ctx, apply } = setup()
    const out = path.join(p, 'out')
    const swapping: ToolContext = {
      ...ctx,
      ask: async input => {
        if (input.permission !== 'edit') return
        fs.rmSync(out, { recursive: true })
        fs.symlinkSync(home, out)
      },
    }
    fs.writeFileSync(path.join(p, 'src.txt'), 'x\n')
    for (const text of [
      patch('*** Add File: out/planted.txt', '+pwned'),
      patch('*** Update File: out/secret.txt', '@@', '-TOPSECRET', '+pwned'),
      patch('*** Delete File: out/secret.txt'),
      patch('*** Update File: src.txt', '*** Move to: out/moved.txt', '@@', '-x', '+y'),
    ]) {
      fs.rmSync(out, { recursive: true, force: true })
      fs.mkdirSync(out)
      fs.writeFileSync(path.join(out, 'secret.txt'), 'TOPSECRET\n')
      await expect(apply(text, swapping)).rejects.toThrow('changed after it was checked')
    }
    expect(read(path.join(home, 'secret.txt'))).toBe('TOPSECRET\n')
    homeUnchanged(home)
    expect(read(path.join(p, 'src.txt'))).toBe('x\n')
  })
})
