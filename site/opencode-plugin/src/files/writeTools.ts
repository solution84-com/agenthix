/**
 * The plugin's `write` and `edit`, in place of OpenCode's (v1.18.32,
 * `tool/write.ts`, `tool/edit.ts`): the same arguments, descriptions, matching
 * and messages, but every file is opened first and changed only if it is
 * exactly the path the gate checked, through that one descriptor
 * (verifiedFs.ts). Missing folders are made the same way.
 *
 * Left out, as Agenthix's configuration turns them off in OpenCode too: the
 * formatter and the language-server diagnostics. Also left out: the diff
 * OpenCode attaches to a change for its own interface, which the site does not
 * read.
 */
import path from 'node:path'
import { tool, type ToolContext, type ToolResult } from '@opencode-ai/plugin/tool'
import { askExternalDirectory, decodeWithBom, joinBom, parseArgs, platformMessage, resolveIn, splitBom } from './common'
import { replace } from './editReplace'
import { EDIT_DESCRIPTION, WRITE_DESCRIPTION } from './descriptions'
import {
  closeQuietly, NotFoundError, openExistingForChange, openExistingForWrite, openFileForWrite, PathChangedError, readAll,
  replaceContents, type FdPaths, type Opened,
} from './verifiedFs'

const z = tool.schema

const writeArgs = {
  content: z.string().describe('The content to write to the file'),
  filePath: z.string().describe('The absolute path to the file to write (must be absolute, not relative)'),
}
const editArgs = {
  filePath: z.string().describe('The absolute path to the file to modify'),
  oldString: z.string().describe('The text to replace'),
  newString: z.string().describe('The text to replace it with (must be different from oldString)'),
  replaceAll: z.boolean().optional().describe('Replace all occurrences of oldString (default false)'),
}
const writeSchema = z.object(writeArgs)
const editSchema = z.object(editArgs)

const locks = new Map<string, Promise<unknown>>()

/** One change to a file at a time, as OpenCode's edit does. */
async function withLock<T>(filePath: string, fn: () => Promise<T>): Promise<T> {
  const key = path.resolve(filePath)
  const before = locks.get(key) ?? Promise.resolve()
  const run = before.then(fn, fn)
  const settled = run.catch(() => undefined)
  locks.set(key, settled)
  try {
    return await run
  } finally {
    if (locks.get(key) === settled) locks.delete(key)
  }
}

/** An existing file, opened to change — or only to read when it may not be written, so it fails at the write, as OpenCode's does. */
type Existing = Opened & { writable: boolean }

const errnoOf = (err: unknown) => (err as NodeJS.ErrnoException | undefined)?.code
const isDenied = (err: unknown) => errnoOf(err) === 'EACCES' || errnoOf(err) === 'EPERM'

/** The file at `filePath` if there is one; `failed` words a failure to open it as the tool's OpenCode counterpart would. */
function openIfThere(sys: FdPaths, filePath: string, failed: (err: unknown) => Error): Existing | null {
  try {
    return { ...openExistingForWrite(sys, filePath), writable: true }
  } catch (err) {
    if (err instanceof NotFoundError) return null
    if (err instanceof PathChangedError) throw err
    if (!isDenied(err)) throw failed(err)
  }
  try {
    return { ...openExistingForChange(sys, filePath), writable: false }
  } catch (err) {
    if (err instanceof PathChangedError) throw err
    throw failed(err)
  }
}

/** OpenCode's write reads an existing file first, and writes only once the path is known not to be one. */
const writeOpenFailed = (filePath: string) => (err: unknown) =>
  new Error(platformMessage(errnoOf(err) === 'ENOTDIR' ? 'writeFile' : 'readFile', filePath, err))

/** OpenCode's edit looks the file up first, and reads it once it knows it is a file. */
const editOpenFailed = (filePath: string) => (err: unknown) => {
  if (errnoOf(err) === 'EISDIR') return new Error(`Path is a directory, not a file: ${filePath}`)
  if (isDenied(err)) return new Error(platformMessage('readFile', filePath, err))
  return err as Error
}

async function askEdit(ctx: ToolContext, filePath: string): Promise<void> {
  await ctx.ask({
    permission: 'edit',
    patterns: [path.relative(ctx.worktree, filePath)],
    always: ['*'],
    metadata: { filepath: filePath },
  })
}

/** Writes through the descriptor already open, or creates the file (and its folders) and writes that. */
function writeFile(sys: FdPaths, existing: Existing | null, filePath: string, text: string): void {
  if (existing && !existing.writable) throw new Error(platformMessage('writeFile', filePath, { code: 'EACCES' }))
  try {
    const fd = existing ? existing.fd : openFileForWrite(sys, filePath).fd
    try {
      replaceContents(fd, Buffer.from(text, 'utf-8'))
    } finally {
      if (!existing) closeQuietly(fd)
    }
  } catch (err) {
    if (err instanceof PathChangedError) throw err
    throw new Error(platformMessage('writeFile', filePath, err))
  }
}

export function writeTool(sys: FdPaths) {
  return tool({
    description: WRITE_DESCRIPTION,
    args: writeArgs,
    async execute(raw: unknown, ctx: ToolContext): Promise<ToolResult> {
      const params = parseArgs('write', writeSchema, raw)
      const filepath = resolveIn(ctx, params.filePath)
      await askExternalDirectory(ctx, filepath)
      const existing = openIfThere(sys, filepath, writeOpenFailed(filepath))
      try {
        const source = existing ? decodeWithBom(readAll(existing.fd)) : { bom: false, text: '' }
        const next = splitBom(params.content)
        await askEdit(ctx, filepath)
        writeFile(sys, existing, filepath, joinBom(next.text, source.bom || next.bom))
      } finally {
        if (existing) closeQuietly(existing.fd)
      }
      return {
        title: path.relative(ctx.worktree, filepath),
        metadata: { diagnostics: {}, filepath, exists: existing !== null },
        output: 'Wrote file successfully.',
      }
    },
  })
}

function detectLineEnding(text: string): '\n' | '\r\n' {
  return text.includes('\r\n') ? '\r\n' : '\n'
}

function withLineEnding(text: string, ending: '\n' | '\r\n'): string {
  const normal = text.replaceAll('\r\n', '\n')
  return ending === '\n' ? normal : normal.replaceAll('\n', '\r\n')
}

export function editTool(sys: FdPaths) {
  return tool({
    description: EDIT_DESCRIPTION,
    args: editArgs,
    async execute(raw: unknown, ctx: ToolContext): Promise<ToolResult> {
      const params = parseArgs('edit', editSchema, raw)
      if (!params.filePath) throw new Error('filePath is required')
      if (params.oldString === params.newString) throw new Error('No changes to apply: oldString and newString are identical.')
      const filePath = resolveIn(ctx, params.filePath)
      await askExternalDirectory(ctx, filePath)

      await withLock(filePath, async () => {
        const existing = openIfThere(sys, filePath, editOpenFailed(filePath))
        try {
          if (params.oldString === '') {
            if (existing) {
              throw new Error(
                'oldString cannot be empty when editing an existing file. Provide the exact text to replace, or use write for an intentional full-file replacement.',
              )
            }
            const next = splitBom(params.newString)
            await askEdit(ctx, filePath)
            writeFile(sys, null, filePath, joinBom(next.text, next.bom))
            return
          }
          if (!existing) throw new Error(`File ${filePath} not found`)
          if (existing.stat.isDirectory()) throw new Error(`Path is a directory, not a file: ${filePath}`)
          const source = decodeWithBom(readAll(existing.fd))
          const ending = detectLineEnding(source.text)
          const old = withLineEnding(params.oldString, ending)
          const replacement = withLineEnding(params.newString, ending)
          const next = splitBom(replace(source.text, old, replacement, params.replaceAll))
          await askEdit(ctx, filePath)
          writeFile(sys, existing, filePath, joinBom(next.text, source.bom || next.bom))
        } finally {
          if (existing) closeQuietly(existing.fd)
        }
      })

      return {
        metadata: { diagnostics: {} },
        title: path.relative(ctx.worktree, filePath),
        output: 'Edit applied successfully.',
      }
    },
  })
}
