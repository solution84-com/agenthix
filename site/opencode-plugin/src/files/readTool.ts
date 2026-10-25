/**
 * The plugin's `read`, in place of OpenCode's (v1.18.32, `tool/read.ts`): the
 * same arguments, description and output, but the file or folder is opened
 * first and read only if it is exactly the path the gate checked
 * (verifiedFs.ts).
 *
 * Where it differs: OpenCode's own tool output is never cut again, but a
 * plugin tool's is, at 2,000 lines or 50 KB. So this one keeps its whole
 * answer under that — at most 1,990 lines, and 50 KB counted with the line
 * numbers — and says so the way OpenCode's does.
 */
import fs from 'node:fs'
import path from 'node:path'
import { tool, type ToolContext, type ToolResult } from '@opencode-ai/plugin/tool'
import { askExternalDirectory, parseArgs, platformMessage, resolveIn } from './common'
import { InstructionFiles } from './instructions'
import {
  closeQuietly, isBinaryFile, listFolder, MAX_BYTES, MAX_BYTES_LABEL, NotFoundError, openForRead, PathChangedError,
  readAll, readLines, readSample, sniffMime, SUPPORTED_IMAGE_MIMES, type FdPaths,
} from '@agenthix/core/file-tools'
import { READ_DESCRIPTION } from './descriptions'

const DEFAULT_READ_LIMIT = 2000
const MAX_SHOWN_LINES = 1990
const OUTPUT_ROOM = 512

const z = tool.schema
const args = {
  filePath: z.string().describe('The absolute path to the file or directory to read'),
  offset: z.number().int().min(0).optional().describe('The line number to start reading from (1-indexed)'),
  limit: z.number().int().min(0).optional().describe('The maximum number of lines to read (defaults to 2000)'),
}
const schema = z.object(args)

function missing(sys: FdPaths, filepath: string): Error {
  const dir = path.dirname(filepath)
  const base = path.basename(filepath).toLowerCase()
  let near: string[] = []
  try {
    const opened = openForRead(sys, dir)
    try {
      near = listFolder(sys, opened.fd)
        .map(e => e.name)
        .filter(item => item.toLowerCase().includes(base) || base.includes(item.toLowerCase()))
        .map(item => path.join(dir, item))
        .slice(0, 3)
    } finally {
      closeQuietly(opened.fd)
    }
  } catch { /* no suggestions */ }
  if (near.length > 0) return new Error(`File not found: ${filepath}\n\nDid you mean one of these?\n${near.join('\n')}`)
  return new Error(`File not found: ${filepath}`)
}

/**
 * Why the file could not be opened, as OpenCode would say it. OpenCode looks
 * the path up first and opens it after asking; a path it cannot look up fails
 * there, before the asks, and a file it may not open fails at the open.
 */
function openFailure(filepath: string, err: unknown): Error {
  if (err instanceof PathChangedError) throw err
  const code = (err as NodeJS.ErrnoException).code
  if (code === 'EACCES' || code === 'EPERM') return new Error(platformMessage('open', filepath, err))
  throw new Error(platformMessage('stat', filepath, err))
}

function listEntries(sys: FdPaths, fd: number): string[] {
  return listFolder(sys, fd)
    .map(entry => {
      if (entry.isDirectory()) return entry.name + '/'
      if (!entry.isSymbolicLink()) return entry.name
      try {
        return fs.statSync(sys.child(fd, entry.name)).isDirectory() ? entry.name + '/' : entry.name
      } catch {
        return entry.name
      }
    })
    .sort((a, b) => a.localeCompare(b))
}

export function readTool(sys: FdPaths, instructions: InstructionFiles) {
  return tool({
    description: READ_DESCRIPTION,
    args,
    async execute(raw: unknown, ctx: ToolContext): Promise<ToolResult> {
      const params = parseArgs('read', schema, raw)
      const filepath = resolveIn(ctx, params.filePath)
      const title = path.relative(ctx.worktree, filepath)

      let opened: ReturnType<typeof openForRead> | null = null
      let denied: Error | null = null
      try {
        opened = openForRead(sys, filepath)
      } catch (err) {
        if (!(err instanceof NotFoundError)) denied = openFailure(filepath, err)
      }
      try {
        await askExternalDirectory(ctx, filepath, opened?.stat.isDirectory() ? 'directory' : 'file')
        await ctx.ask({ permission: 'read', patterns: [path.relative(ctx.worktree, filepath)], always: ['*'], metadata: {} })
        if (denied) throw denied
        if (!opened) throw missing(sys, filepath)

        const limit = params.limit ?? DEFAULT_READ_LIMIT
        const offset = params.offset || 1
        if (opened.stat.isDirectory()) return folderResult(sys, opened.fd, filepath, title, limit, offset)

        const loaded = instructions.resolve(ctx.sessionID, ctx.directory, filepath)
        const sample = readSample(opened.fd, opened.stat.size)
        const mime = sniffMime(sample, filepath)
        if (SUPPORTED_IMAGE_MIMES.has(mime) || mime === 'application/pdf') {
          const msg = mime === 'application/pdf' ? 'PDF read successfully' : 'Image read successfully'
          const bytes = readAll(opened.fd)
          return {
            title,
            output: msg,
            metadata: { preview: msg, truncated: false, loaded: loaded.map(i => i.filepath) },
            attachments: [{ type: 'file', mime, url: `data:${mime};base64,${Buffer.from(bytes).toString('base64')}` }],
          }
        }
        if (isBinaryFile(filepath, sample)) throw new Error(`Cannot read binary file: ${filepath}`)
        return fileResult(opened.fd, filepath, title, Math.min(limit, MAX_SHOWN_LINES), offset, loaded)
      } finally {
        if (opened) closeQuietly(opened.fd)
      }
    },
  })
}

function folderResult(sys: FdPaths, fd: number, filepath: string, title: string, limit: number, offset: number): ToolResult {
  const items = listEntries(sys, fd)
  const start = offset - 1
  const sliced = items.slice(start, start + Math.min(limit, MAX_SHOWN_LINES))
  const truncated = start + sliced.length < items.length
  return {
    title,
    output: [
      `<path>${filepath}</path>`,
      `<type>directory</type>`,
      `<entries>`,
      sliced.join('\n'),
      truncated
        ? `\n(Showing ${sliced.length} of ${items.length} entries. Use 'offset' parameter to read beyond entry ${offset + sliced.length})`
        : `\n(${items.length} entries)`,
      `</entries>`,
    ].join('\n'),
    metadata: {
      preview: sliced.slice(0, 20).join('\n'),
      truncated,
      loaded: [],
      display: { type: 'directory', path: filepath, entries: sliced, offset, totalEntries: items.length, truncated },
    },
  }
}

function fileResult(
  fd: number, filepath: string, title: string, limit: number, offset: number,
  loaded: { filepath: string; content: string }[],
): ToolResult {
  const file = readLines(fd, { limit, offset, maxBytes: MAX_BYTES - OUTPUT_ROOM })
  if (file.count < file.offset && !(file.count === 0 && file.offset === 1)) {
    throw new Error(`Offset ${file.offset} is out of range for this file (${file.count} lines)`)
  }
  let output = [`<path>${filepath}</path>`, `<type>file</type>`, '<content>\n'].join('\n')
  output += file.raw.map((line, i) => `${i + file.offset}: ${line}`).join('\n')
  const last = file.offset + file.raw.length - 1
  const next = last + 1
  const truncated = file.more || file.cut
  if (file.cut) output += `\n\n(Output capped at ${MAX_BYTES_LABEL}. Showing lines ${file.offset}-${last}. Use offset=${next} to continue.)`
  else if (file.more) output += `\n\n(Showing lines ${file.offset}-${last} of ${file.count}. Use offset=${next} to continue.)`
  else output += `\n\n(End of file - total ${file.count} lines)`
  output += '\n</content>'
  if (loaded.length > 0) output += `\n\n<system-reminder>\n${loaded.map(i => i.content).join('\n\n')}\n</system-reminder>`
  return {
    title,
    output,
    metadata: {
      preview: file.raw.slice(0, 20).join('\n'),
      truncated,
      loaded: loaded.map(i => i.filepath),
      display: {
        type: 'file', path: filepath, text: file.raw.join('\n'), lineStart: file.offset, lineEnd: last,
        totalLines: file.count, truncated,
      },
    },
  }
}
