/**
 * What the plugin's file tools share with each other and with OpenCode's own
 * (v1.18.32, `tool/external-directory.ts`, `tool/tool.ts`, `util/bom.ts`):
 * where a path lands, the permission asks OpenCode's tools make, the
 * invalid-arguments and file-system failure messages, and byte-order marks.
 */
import path from 'node:path'
import type { ToolContext } from '@opencode-ai/plugin/tool'
import type { z } from 'zod'
import { NotFoundError } from './verifiedFs'

export function contains(parent: string, child: string): boolean {
  const result = path.relative(parent, child)
  return result === '' || (!path.isAbsolute(result) && result !== '..' && !result.startsWith(`..${path.sep}`))
}

/** A path as OpenCode's own file tools take it: absolute as given, or inside the session's folder. */
export function resolveIn(ctx: ToolContext, filePath: string): string {
  return path.isAbsolute(filePath) ? filePath : path.resolve(ctx.directory, filePath)
}

function containsPath(filepath: string, ctx: ToolContext): boolean {
  if (contains(ctx.directory, filepath)) return true
  if (ctx.worktree === '/') return false
  return contains(ctx.worktree, filepath)
}

/** OpenCode's `external_directory` ask for a path outside the project. Agenthix's rules allow it (spec, "Tool-name mapping"). */
export async function askExternalDirectory(ctx: ToolContext, target: string, kind: 'file' | 'directory' = 'file'): Promise<void> {
  if (containsPath(target, ctx)) return
  const dir = kind === 'directory' ? target : path.dirname(target)
  const glob = path.join(dir, '*').replaceAll('\\', '/')
  await ctx.ask({ permission: 'external_directory', patterns: [glob], always: [glob], metadata: { filepath: target, parentDir: dir } })
}

/** The arguments as the tool's schema reads them, or OpenCode's own message for arguments that do not fit. */
export function parseArgs<S extends z.ZodType>(tool: string, schema: S, args: unknown): z.infer<S> {
  const parsed = schema.safeParse(args)
  if (parsed.success) return parsed.data
  const detail = parsed.error.issues.map(i => `${i.path.join('.') || 'input'}: ${i.message}`).join('; ')
  throw new Error(`The ${tool} tool was called with invalid arguments: ${detail}.\nPlease rewrite the input so it satisfies the expected schema.`)
}

const PLATFORM_TAGS: Record<string, string> = {
  ENOENT: 'NotFound', EACCES: 'PermissionDenied', EPERM: 'PermissionDenied', EEXIST: 'AlreadyExists',
  EISDIR: 'BadResource', ENOTDIR: 'BadResource', EBUSY: 'Busy',
}

/**
 * A file-system failure as OpenCode's file service (Effect's platform errors)
 * words it, e.g. `NotFound: FileSystem.readFile (<path>)`: the kind of failure,
 * the operation and the path, nothing of the system's own message.
 */
export function platformMessage(method: string, p: string, err: unknown): string {
  const code = err instanceof NotFoundError ? 'ENOENT' : (err as NodeJS.ErrnoException | undefined)?.code
  return `${(code && PLATFORM_TAGS[code]) ?? 'Unknown'}: FileSystem.${method} (${p})`
}

const BOM_CODE = 0xfeff
const BOM = String.fromCharCode(BOM_CODE)

export function splitBom(text: string): { bom: boolean; text: string } {
  if (text.charCodeAt(0) !== BOM_CODE) return { bom: false, text }
  return { bom: true, text: text.slice(1) }
}

export function joinBom(text: string, bom: boolean): string {
  const stripped = splitBom(text).text
  return bom ? BOM + stripped : stripped
}

export function decodeWithBom(bytes: Uint8Array): { bom: boolean; text: string } {
  return splitBom(new TextDecoder('utf-8', { ignoreBOM: true }).decode(bytes))
}
