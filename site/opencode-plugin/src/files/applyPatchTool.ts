/**
 * The plugin's `apply_patch`, in place of OpenCode's (v1.18.32,
 * `tool/apply_patch.ts`), which OpenCode offers GPT models instead of `edit`
 * and `write` (`tool/registry.ts`). The same argument, description, patch
 * format (OpenCode's parser, copied in patchParse.ts and patchApply.ts), order
 * of work and messages: every hunk is read and worked out first, the `edit`
 * permission is asked once, then the changes are made in turn. But every file
 * the patch reads, writes, adds, deletes or moves is opened first and used only
 * if it is exactly the path the gate checked, and a removal happens inside the
 * folder already checked (verifiedFs.ts), never by path.
 *
 * Left out, as in the plugin's `write` and `edit`: the formatter and the
 * language-server diagnostics, which Agenthix's configuration turns off in
 * OpenCode too, and the diff OpenCode attaches for its own interface, which the
 * site does not read.
 */
import path from 'node:path'
import { tool, type ToolContext, type ToolResult } from '@opencode-ai/plugin/tool'
import { askExternalDirectory, decodeWithBom, joinBom, parseArgs, platformMessage, resolveIn, splitBom } from './common'
import { APPLY_PATCH_DESCRIPTION } from './descriptions'
import { deriveNewContentsFromChunks } from './patchApply'
import { parsePatch, type Hunk } from './patchParse'
import {
  closeQuietly, entryStat, openExistingForChange, openFileForWrite, PathChangedError, readAll, removeFile,
  replaceContents, type FdPaths,
} from '@agenthix/core/file-tools'

const z = tool.schema

const applyPatchArgs = {
  patchText: z.string().describe('The full patch text that describes all changes to be made'),
}
const applyPatchSchema = z.object(applyPatchArgs)

type Change = {
  filePath: string
  newContent: string
  type: 'add' | 'update' | 'delete' | 'move'
  movePath?: string
  bom: boolean
}

const verificationFailed = (detail: string) => new Error(`apply_patch verification failed: ${detail}`)

/** Runs one file operation, keeping a refusal as it is and giving any other failure OpenCode's wording. */
function asPlatform<T>(method: string, p: string, fn: () => T): T {
  try {
    return fn()
  } catch (err) {
    if (err instanceof PathChangedError) throw err
    throw new Error(platformMessage(method, p, err))
  }
}


/** The text of an existing file the patch updates, read through the checked descriptor. */
function readForUpdate(sys: FdPaths, filePath: string): { text: string; bom: boolean } {
  const missing = () => verificationFailed(`Failed to read file to update: ${filePath}`)
  let opened
  try {
    opened = openExistingForChange(sys, filePath)
  } catch (err) {
    if (err instanceof PathChangedError) throw err
    throw missing()
  }
  try {
    if (opened.stat.isDirectory()) throw missing()
    return decodeWithBom(readAll(opened.fd))
  } finally {
    closeQuietly(opened.fd)
  }
}

/**
 * That a file the patch deletes is there, and not a folder. OpenCode reads it
 * first, following a link; this looks at the entry itself, which is what
 * OpenCode then removes, so nothing a link leads to is ever read.
 */
function checkForDelete(sys: FdPaths, filePath: string): void {
  let stat
  try {
    stat = entryStat(sys, filePath)
  } catch (err) {
    if (err instanceof PathChangedError) throw err
    throw verificationFailed(platformMessage('readFile', filePath, err))
  }
  if (stat.isDirectory()) throw verificationFailed(platformMessage('readFile', filePath, { code: 'EISDIR' }))
}

function writeChecked(sys: FdPaths, filePath: string, text: string): void {
  asPlatform('writeFile', filePath, () => {
    const { fd } = openFileForWrite(sys, filePath)
    try {
      replaceContents(fd, Buffer.from(text, 'utf-8'))
    } finally {
      closeQuietly(fd)
    }
  })
}

async function planChange(sys: FdPaths, ctx: ToolContext, hunk: Hunk): Promise<Change> {
  const filePath = resolveIn(ctx, hunk.path)
  await askExternalDirectory(ctx, filePath)
  switch (hunk.type) {
    case 'add': {
      const newContent = hunk.contents.length === 0 || hunk.contents.endsWith('\n') ? hunk.contents : `${hunk.contents}\n`
      const next = splitBom(newContent)
      return { filePath, newContent: next.text, type: 'add', bom: next.bom }
    }
    case 'update': {
      const source = readForUpdate(sys, filePath)
      let update
      try {
        update = deriveNewContentsFromChunks(filePath, hunk.chunks, joinBom(source.text, source.bom))
      } catch (error) {
        throw verificationFailed(`${error}`)
      }
      const movePath = hunk.move_path ? resolveIn(ctx, hunk.move_path) : undefined
      if (movePath) await askExternalDirectory(ctx, movePath)
      return { filePath, newContent: update.content, type: hunk.move_path ? 'move' : 'update', movePath, bom: update.bom }
    }
    case 'delete': {
      checkForDelete(sys, filePath)
      return { filePath, newContent: '', type: 'delete', bom: false }
    }
  }
}

function applyChange(sys: FdPaths, change: Change): void {
  const text = joinBom(change.newContent, change.bom)
  switch (change.type) {
    case 'add':
    case 'update':
      writeChecked(sys, change.filePath, text)
      return
    case 'move':
      if (!change.movePath) return
      writeChecked(sys, change.movePath, text)
      asPlatform('remove', change.filePath, () => removeFile(sys, change.filePath))
      return
    case 'delete':
      asPlatform('remove', change.filePath, () => removeFile(sys, change.filePath))
  }
}

const relative = (ctx: ToolContext, p: string) => path.relative(ctx.worktree, p).replaceAll('\\', '/')

function summaryLine(ctx: ToolContext, change: Change): string {
  if (change.type === 'add') return `A ${relative(ctx, change.filePath)}`
  if (change.type === 'delete') return `D ${relative(ctx, change.filePath)}`
  return `M ${relative(ctx, change.movePath ?? change.filePath)}`
}

export function applyPatchTool(sys: FdPaths) {
  return tool({
    description: APPLY_PATCH_DESCRIPTION,
    args: applyPatchArgs,
    async execute(raw: unknown, ctx: ToolContext): Promise<ToolResult> {
      const params = parseArgs('apply_patch', applyPatchSchema, raw)
      if (!params.patchText) throw new Error('patchText is required')

      let hunks: Hunk[]
      try {
        hunks = parsePatch(params.patchText).hunks
      } catch (error) {
        throw verificationFailed(`${error}`)
      }
      if (hunks.length === 0) {
        const normalized = params.patchText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim()
        if (normalized === '*** Begin Patch\n*** End Patch') throw new Error('patch rejected: empty patch')
        throw verificationFailed('no hunks found')
      }

      const changes: Change[] = []
      for (const hunk of hunks) changes.push(await planChange(sys, ctx, hunk))

      const relativePaths = changes.map(c => relative(ctx, c.filePath))
      await ctx.ask({
        permission: 'edit',
        patterns: relativePaths,
        always: ['*'],
        metadata: { filepath: relativePaths.join(', ') },
      })

      for (const change of changes) applyChange(sys, change)

      const output = `Success. Updated the following files:\n${changes.map(c => summaryLine(ctx, c)).join('\n')}`
      return { title: output, metadata: { diagnostics: {} }, output }
    },
  })
}
