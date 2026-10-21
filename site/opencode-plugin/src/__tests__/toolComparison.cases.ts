/**
 * The fixture projects the tool comparison runs (toolComparison.container.test.ts).
 * Each case is a small project copied fresh into CMP before each side runs it,
 * and one or more turns of scripted tool calls. Add a case here when an
 * OpenCode upgrade touches behaviour none of these reaches.
 */

export const CMP = '/projects/p1/files/cmp'
export const SKILL = 'cmp-skill'

/** A file's contents, an empty folder, or a link and where it points. */
export type Entry = string | Buffer | { folder: true } | { link: string }
export type Call = { name: string; args: Record<string, unknown> }
export interface Case {
  name: string
  files: Record<string, Entry>
  /** Each turn is a list of model steps, each step a list of calls. */
  turns: Call[][][]
  /** Run inside CMP, as the harness's user, after the files are copied in. */
  after?: string
  /** Offer the tools a GPT model gets: apply_patch in place of edit and write. */
  gpt?: boolean
  /** Restart the OpenCode server between the turns, keeping the session. */
  restart?: boolean
  /** Stage SKILL_FILES as this conversation's skill (ours) and in OpenCode's skills path (theirs). */
  skills?: boolean
}

const at = (p: string) => `${CMP}/${p}`
const read = (p: string, extra: Record<string, unknown> = {}): Call => ({ name: 'read', args: { filePath: at(p), ...extra } })
const write = (p: string, content: string): Call => ({ name: 'write', args: { filePath: at(p), content } })
const edit = (p: string, oldString: string, newString: string, replaceAll?: boolean): Call =>
  ({ name: 'edit', args: { filePath: at(p), oldString, newString, ...(replaceAll === undefined ? {} : { replaceAll }) } })
const patch = (...lines: string[]): Call =>
  ({ name: 'apply_patch', args: { patchText: ['*** Begin Patch', ...lines, '*** End Patch'].join('\n') } })
const one = (...calls: Call[]): Call[][][] => [calls.map(c => [c])]

const lines = (n: number, width = 0) =>
  Array.from({ length: n }, (_, i) => `line ${i + 1}`.padEnd(width, '.')).join('\n') + '\n'
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64')
const BOM = '﻿'
const SMALL = 'one\ntwo\nthree\n'

export const SKILL_FILES: Record<string, string> = {
  'SKILL.md': `---\nname: ${SKILL}\ndescription: A skill the comparison loads.\n---\n\n# Comparing\n\nRun scripts/run.sh first.\n`,
  'scripts/run.sh': 'echo run\n',
  'reference.md': 'Reference.\n',
}

export const CASES: Case[] = [
  // read
  { name: 'read-small', files: { 'a.txt': SMALL }, turns: one(read('a.txt'), read('a.txt', { offset: 2, limit: 1 })) },
  { name: 'read-many-lines', files: { 'big.txt': lines(3000) }, turns: one(read('big.txt'), read('big.txt', { offset: 2500 })) },
  { name: 'read-many-bytes', files: { 'wide.txt': lines(1500, 100) }, turns: one(read('wide.txt'), read('wide.txt', { offset: 1400 })) },
  { name: 'read-long-line', files: { 'long.txt': 'x'.repeat(5000) + '\nshort\n' }, turns: one(read('long.txt')) },
  { name: 'read-empty', files: { 'empty.txt': '' }, turns: one(read('empty.txt')) },
  { name: 'read-offset-past-end', files: { 'a.txt': SMALL }, turns: one(read('a.txt', { offset: 10 })) },
  { name: 'read-binary', files: { 'data': Buffer.from([0x7f, 0x45, 0x4c, 0x46, 0, 1, 2, 3]), 'x.bin': 'text in a .bin\n' }, turns: one(read('data'), read('x.bin')) },
  { name: 'read-image', files: { 'dot.png': PNG }, turns: one(read('dot.png')) },
  { name: 'read-missing', files: { 'notes.txt.bak': 'b\n' }, turns: one(read('notes.txt'), read('zzz.md')) },
  { name: 'read-folder', files: { 'd/b.txt': 'b', 'd/a.txt': 'a', 'd/sub/c.txt': 'c', 'd/to-sub': { link: 'sub' } }, turns: one(read('d'), read('d', { offset: 2, limit: 2 })) },
  { name: 'read-bom-crlf', files: { 'bom.txt': `${BOM}first\r\nsecond\r\n` }, turns: one(read('bom.txt')) },
  { name: 'read-unreadable', files: { 'locked.txt': 'secret\n' }, after: 'chmod 000 locked.txt', turns: one(read('locked.txt')) },
  { name: 'read-under-file', files: { 'a.txt': SMALL }, turns: one(read('a.txt/x.txt')) },
  { name: 'read-invalid-args', files: {}, turns: one({ name: 'read', args: { offset: 1 } }) },
  {
    name: 'read-agents-md', files: { 'sub/AGENTS.md': 'Instructions for sub.\n', 'sub/x.txt': 'x\n', 'sub/y.txt': 'y\n' },
    turns: one(read('sub/x.txt'), read('sub/y.txt')),
  },
  {
    name: 'read-agents-md-restart', files: { 'sub/AGENTS.md': 'Instructions for sub.\n', 'sub/x.txt': 'x\n', 'sub/y.txt': 'y\n' },
    turns: [[[read('sub/x.txt')]], [[read('sub/y.txt')]]], restart: true,
  },

  // write
  { name: 'write-new', files: {}, turns: one(write('new/deep/f.txt', 'hello\n')) },
  { name: 'write-overwrite', files: { 'a.txt': SMALL }, turns: one(write('a.txt', 'replaced\n')) },
  { name: 'write-bom', files: { 'bom.txt': `${BOM}old\n` }, turns: one(write('bom.txt', 'new\n')) },
  { name: 'write-under-file', files: { 'a.txt': SMALL }, turns: one(write('a.txt/x.txt', 'x\n')) },
  { name: 'write-read-only', files: { 'a.txt': SMALL }, after: 'chmod 444 a.txt', turns: one(write('a.txt', 'replaced\n')) },
  { name: 'write-folder', files: { 'd': { folder: true } }, turns: one(write('d', 'x\n')) },

  // edit
  { name: 'edit-ok', files: { 'a.txt': SMALL }, turns: one(edit('a.txt', 'two', 'TWO')) },
  { name: 'edit-no-match', files: { 'a.txt': SMALL }, turns: one(edit('a.txt', 'four', 'FOUR')) },
  { name: 'edit-many-matches', files: { 'a.txt': 'x = 1\nx = 1\n' }, turns: one(edit('a.txt', 'x = 1', 'x = 2')) },
  { name: 'edit-replace-all', files: { 'a.txt': 'x = 1\nx = 1\n' }, turns: one(edit('a.txt', 'x = 1', 'x = 2', true)) },
  { name: 'edit-identical', files: { 'a.txt': SMALL }, turns: one(edit('a.txt', 'two', 'two')) },
  { name: 'edit-missing', files: {}, turns: one(edit('gone.txt', 'a', 'b')) },
  { name: 'edit-create', files: {}, turns: one(edit('made/new.txt', '', 'created\n')) },
  { name: 'edit-under-file', files: { 'a.txt': SMALL }, turns: one(edit('a.txt/x.txt', 'a', 'b')) },
  { name: 'edit-read-only', files: { 'a.txt': SMALL }, after: 'chmod 444 a.txt', turns: one(edit('a.txt', 'two', 'TWO')) },
  { name: 'edit-folder', files: { 'd': { folder: true } }, turns: one(edit('d', 'a', 'b')) },
  {
    name: 'edit-loose-match', files: { 'f.js': 'function f() {\n    return 1\n}\n' },
    turns: one(edit('f.js', 'function f() {\n  return 1\n}', 'function f() {\n  return 2\n}')),
  },
  { name: 'edit-crlf-bom', files: { 'w.txt': `${BOM}alpha\r\nbeta\r\n` }, turns: one(edit('w.txt', 'alpha\nbeta', 'alpha\nBETA')) },

  // apply_patch (GPT models only)
  {
    name: 'patch-many-files', gpt: true, files: { 'keep.txt': 'one\ntwo\n', 'old.txt': 'x\n', 'gone.txt': 'bye\n' },
    turns: one(patch(
      '*** Add File: cmp/new/hello.txt', '+Hello',
      '*** Update File: cmp/keep.txt', '@@', '-two', '+TWO',
      '*** Update File: cmp/old.txt', '*** Move to: cmp/moved.txt', '@@', '-x', '+y',
      '*** Delete File: cmp/gone.txt',
    )),
  },
  {
    name: 'patch-fails-part-way', gpt: true, files: { 'blocker': 'a file, not a folder\n' },
    turns: one(patch('*** Add File: cmp/first.txt', '+first', '*** Add File: cmp/blocker/second.txt', '+second', '*** Add File: cmp/third.txt', '+third')),
  },
  { name: 'patch-bad-context', gpt: true, files: { 'a.txt': SMALL }, turns: one(patch('*** Add File: cmp/b.txt', '+b', '*** Update File: cmp/a.txt', '@@', '-four', '+FOUR')) },
  { name: 'patch-update-missing', gpt: true, files: {}, turns: one(patch('*** Update File: cmp/none.txt', '@@', '-a', '+b')) },
  { name: 'patch-delete-missing', gpt: true, files: {}, turns: one(patch('*** Delete File: cmp/none.txt')) },
  { name: 'patch-update-read-only', gpt: true, files: { 'a.txt': SMALL }, after: 'chmod 444 a.txt', turns: one(patch('*** Update File: cmp/a.txt', '@@', '-two', '+TWO')) },
  { name: 'patch-update-folder', gpt: true, files: { 'd': { folder: true } }, turns: one(patch('*** Update File: cmp/d', '@@', '-a', '+b')) },
  { name: 'patch-empty', gpt: true, files: {}, turns: one(patch(), { name: 'apply_patch', args: { patchText: '' } }) },
  { name: 'patch-malformed', gpt: true, files: {}, turns: one({ name: 'apply_patch', args: { patchText: 'not a patch' } }, patch('nonsense')) },
  { name: 'patch-bom', gpt: true, files: { 'b.txt': `${BOM}one\ntwo\n` }, turns: one(patch('*** Update File: cmp/b.txt', '@@', '-two', '+TWO')) },
  {
    name: 'patch-move-link', gpt: true, files: { 'real.txt': 'x\n', 'link.txt': { link: 'real.txt' } },
    turns: one(patch('*** Update File: cmp/link.txt', '*** Move to: cmp/moved.txt', '@@', '-x', '+y')),
  },
  {
    name: 'patch-delete-dangling-link', gpt: true, files: { 'dangling': { link: 'nowhere.txt' } },
    turns: one(patch('*** Delete File: cmp/dangling')),
  },

  // skill
  { name: 'skill-load', skills: true, files: {}, turns: one({ name: 'skill', args: { name: SKILL } }) },
  { name: 'skill-missing', skills: true, files: {}, turns: one({ name: 'skill', args: { name: 'no-such-skill' } }) },
]
