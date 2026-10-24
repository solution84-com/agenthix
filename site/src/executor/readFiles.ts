/**
 * `workflow.readFiles`: a proposal's definition and files, read from the workspace the agent wrote them in, for hq
 * to hash and show (workflows spec part 1, *A version*). A symbolic or hard link is refused, never followed, and each
 * path is reached from an open directory one part at a time (`safeTree.ts`), so a link swapped in while the files are
 * read cannot point the site at a file outside the workspace.
 */
import {
  normaliseWorkflowPath, WORKFLOW_LIMITS, WORKSPACE_OWNER_TYPES,
  type WorkflowReadFilesResult, type WorkflowReadRefusal, type WorkflowWireFile,
} from '@agenthix/core'
import { z } from 'zod'
import { closeDir, LinkRefused, openDirPath, openFileIn, openRoot, type Dir } from './safeTree'
import { resolveWorkspaceTarget } from './workspaceTarget'

const params = z.object({
  workspace: z.object({
    ownerType: z.enum(WORKSPACE_OWNER_TYPES),
    ownerId: z.string().min(1),
    workspaceId: z.string().min(1).nullable(),
  }).strict(),
  paths: z.array(z.string()).min(1).max(WORKFLOW_LIMITS.filesMax + 1),
}).strict()

const NOTHING = 'Nothing was changed.'

type Refusal = Extract<WorkflowReadFilesResult, { ok: false }>

function refuse(reason: WorkflowReadRefusal, path: string | null, message: string): Refusal {
  return { ok: false, reason, path, message: `${message} ${NOTHING}` }
}

export async function readWorkflowFiles(raw: unknown): Promise<WorkflowReadFilesResult> {
  const parsed = params.safeParse(raw)
  if (!parsed.success) return refuse('invalid_path', null, 'The request names no workspace or no paths this site can read.')
  const { workspace, paths } = parsed.data
  for (const p of paths) {
    const n = normaliseWorkflowPath(p)
    if (!n.ok || n.path !== p) return refuse('invalid_path', p, n.ok ? `${p} is not written as a normalised path (${n.path}).` : n.reason)
  }
  if (new Set(paths).size !== paths.length) return refuse('invalid_path', null, 'A path is named twice.')
  const target = await resolveWorkspaceTarget(workspace)
  if (!target) return refuse('workspace_missing', null, 'This site does not hold that workspace.')

  let root: Dir
  try {
    root = await openRoot(target.hostDir)
  } catch {
    return refuse('workspace_missing', null, 'This site cannot open that workspace.')
  }
  const files: WorkflowWireFile[] = []
  let total = 0
  try {
    for (const p of paths) {
      const read = await readOne(root, p)
      if ('reason' in read) return read
      total += read.bytes.length
      if (total > WORKFLOW_LIMITS.filesBytesMax) return refuse('too_large', p, `The files together are larger than ${WORKFLOW_LIMITS.filesBytesMax} bytes.`)
      files.push({ path: p, contentBase64: read.bytes.toString('base64'), executable: read.executable })
    }
  } finally {
    await closeDir(root)
  }
  return { ok: true, files }
}

async function readOne(root: Dir, p: string): Promise<{ bytes: Buffer; executable: boolean } | Refusal> {
  const at = p.lastIndexOf('/')
  const parentRel = at < 0 ? '' : p.slice(0, at)
  const name = at < 0 ? p : p.slice(at + 1)
  let parent: Dir | null = null
  try {
    parent = await openDirPath(root, parentRel)
    if (!parent) return refuse('missing', p, `${p} is not in the workspace.`)
    const { handle, stat } = await openFileIn(parent, name)
    try {
      if (stat.size > BigInt(WORKFLOW_LIMITS.fileBytesMax)) return refuse('too_large', p, `${p} is larger than ${WORKFLOW_LIMITS.fileBytesMax} bytes.`)
      const bytes = Buffer.alloc(Number(stat.size))
      let read = 0
      while (read < bytes.length) {
        const { bytesRead } = await handle.read(bytes, read, bytes.length - read, read)
        if (bytesRead === 0) break
        read += bytesRead
      }
      return { bytes: bytes.subarray(0, read), executable: (Number(stat.mode) & 0o111) !== 0 }
    } finally {
      await handle.close().catch(() => {})
    }
  } catch (err) {
    if (err instanceof LinkRefused) {
      return err.linkKind === 'not_a_directory'
        ? refuse('missing', p, `${p} is not in the workspace: ${err.relPath} is not a folder.`)
        : refuse('link', p, `${err.message} Copy the file in its place to propose it.`)
    }
    const code = (err as NodeJS.ErrnoException).code
    if (code === 'ENOENT') return refuse('missing', p, `${p} is not in the workspace.`)
    if (code === 'EISDIR') return refuse('not_a_file', p, `${p} is not a file.`)
    if (code === 'ENOTDIR') return refuse('missing', p, `${p} is not in the workspace.`)
    return refuse('missing', p, `${p} could not be read.`)
  } finally {
    if (parent) await closeDir(parent, root)
  }
}
