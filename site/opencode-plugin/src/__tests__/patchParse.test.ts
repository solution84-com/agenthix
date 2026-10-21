import { describe, expect, it } from 'vitest'
import { deriveNewContentsFromChunks } from '../files/patchApply'
import { parsePatch, type Hunk } from '../files/patchParse'

const patch = (...lines: string[]) => ['*** Begin Patch', ...lines, '*** End Patch'].join('\n')

describe("OpenCode's patch parser", () => {
  it('reads add, update with a move, and delete hunks', () => {
    const { hunks } = parsePatch(patch(
      '*** Add File: hello.txt', '+Hello', '+world',
      '*** Update File: src/app.py', '*** Move to: src/main.py', '@@ def greet():', '-print("Hi")', '+print("Hello")',
      '*** Delete File: obsolete.txt',
    ))
    expect(hunks).toEqual([
      { type: 'add', path: 'hello.txt', contents: 'Hello\nworld' },
      { type: 'update', path: 'src/app.py', move_path: 'src/main.py', chunks: [
        { old_lines: ['print("Hi")'], new_lines: ['print("Hello")'], change_context: 'def greet():', is_end_of_file: undefined },
      ] },
      { type: 'delete', path: 'obsolete.txt' },
    ])
  })

  it('reads a patch inside a heredoc, and refuses one without its markers', () => {
    expect(parsePatch(`cat <<'EOF'\n${patch('*** Delete File: a')}\nEOF`).hunks).toEqual([{ type: 'delete', path: 'a' }])
    expect(() => parsePatch('*** Add File: a\n+x')).toThrow('Invalid patch format: missing Begin/End markers')
  })

  it('works out new contents by context, at the end of the file, and across Unicode punctuation', () => {
    const original = 'def a():\n    x = 1\ndef b():\n    x = 1\nlast “quoted”\n'
    const { hunks } = parsePatch(patch(
      '*** Update File: f.py', '@@ def b():', '-    x = 1', '+    x = 2', '@@', '-last "quoted"', '+last', '*** End of File',
    ))
    const update = deriveNewContentsFromChunks('f.py', (hunks[0] as Extract<Hunk, { type: 'update' }>).chunks, original)
    expect(update.content).toBe('def a():\n    x = 1\ndef b():\n    x = 2\nlast\n')
  })

  it("says which lines it could not find, in OpenCode's words", () => {
    const { hunks } = parsePatch(patch('*** Update File: f', '@@', '-missing', '+x'))
    expect(() => deriveNewContentsFromChunks('/p/f', (hunks[0] as Extract<Hunk, { type: 'update' }>).chunks, 'a\n'))
      .toThrow('Failed to find expected lines in /p/f:\nmissing')
  })
})
