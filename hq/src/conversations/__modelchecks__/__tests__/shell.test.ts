/**
 * The checks' shell stand-in: what a run uses to look around answers from the world's files, so a run never meets a
 * shell that seems broken (echo printing nothing sent the baseline model debugging its shell until the rounds ran out).
 */
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { runShell, type ShellWorld } from '../shell'
import { answerRead } from '../readCall'

const world = (): ShellWorld => ({
  folder: '/work',
  files: { 'a.txt': 'alpha', 'src/b.ts': 'beta', '/staged/skills/x/SKILL.md': 'skill' },
  git: args => (args.startsWith('log') ? 'abc Start' : null),
})

describe('the shell stand-in', () => {
  it('prints what echo, printf and pwd print, through chains and pipes', () => {
    expect(runShell('echo hello; echo "world"', world())).toBe('hello\nworld')
    expect(runShell("cd /work && printf 'A\\nB\\n' | cat", world())).toBe('A\nB\n')
    expect(runShell('pwd', world())).toBe('/work')
  })

  it('answers ls, cat and grep from the files, and git from the world', () => {
    expect(runShell('ls -la', world())).toBe('a.txt\nsrc/b.ts')
    expect(runShell('ls /staged/skills', world())).toBe('/staged/skills/x/SKILL.md')
    expect(runShell('cat /work/a.txt 2>&1', world())).toBe('alpha')
    expect(runShell('cat nope.txt', world())).toBe('cat: nope.txt: No such file or directory')
    expect(runShell('grep -r beta .', world())).toBe('/work/src/b.ts')
    expect(runShell('git --no-pager log --oneline | head -5', world())).toBe('abc Start')
    expect(runShell('git stash', world())).toBe('')
  })

  it('says the tools a run checks for are there, and answers curl from what the world serves', () => {
    const w = { ...world(), fetch: (url: string) => (url.includes(':3000') ? '<h1>Shop</h1>' : null) }
    expect(runShell('which node; node --version', w)).toBe('/usr/bin/node\nv24.11.0')
    expect(runShell('curl -s localhost:3000/ | head -5', w)).toBe('<h1>Shop</h1>')
    expect(runShell('curl -s http://localhost:4000', w)).toMatch(/Connection refused/)
  })

  it('writes a redirect into the files, where cat reads it back', () => {
    const w = world()
    expect(runShell('git log > /tmp/out.txt 2>&1; cat /tmp/out.txt', w)).toBe('abc Start')
    expect(runShell('echo hi > notes.txt', w)).toBe('')
    expect(w.files['notes.txt']).toBe('hi')
  })
})

describe('a call with input that does not fit', () => {
  it('is refused with the tool\'s definition, and nothing is run', async () => {
    const tool = { name: 'add_comment', description: 'Comment on a task.', input: z.object({ taskId: z.string(), content: z.string() }) }
    let ran = false
    const result = await answerRead({ name: 'use_tool', input: { name: 'add_comment', input: { taskId: 't1' } } }, [tool], () => { ran = true }, { definitions: [tool] })
    expect(result).toMatchObject({ status: 'refused', reason: expect.stringMatching(/^The input does not fit add_comment: content.*Comment on a task\. Its input: \{.*"content"/) })
    expect(ran).toBe(false)
  })

  it('called natively, is refused in the turn\'s own words, and nothing is run', async () => {
    const tool = { name: 'start_work', description: 'Start work.', input: z.object({ title: z.string(), brief: z.string() }) }
    let ran = false
    const result = await answerRead({ name: 'start_work', input: { title: 'Look it up', what: 'x' } }, [], () => { ran = true }, { definitions: [tool] })
    expect(result).toEqual({ status: 'refused', reason: expect.stringMatching(/^The arguments do not fit start_work: brief: /) })
    expect(ran).toBe(false)
    expect(await answerRead({ name: 'start_work', input: { title: 'Look it up', brief: 'Find it' } }, [], () => 'ran', { definitions: [tool] })).toBe('ran')
  })
})
