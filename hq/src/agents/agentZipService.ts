/**
 * Agent archives from before packages (5b.13), imported: an agent's export is now an agent template package
 * (`agentPackageExport.ts`), installed in the Library.
 *
 * ZIP structure:
 *   {handle}/
 *     agent.json          ← identity and settings
 *     instructions.md
 *     skills/{slug}/…     ← every file of every skill
 *
 * Archives from before packages carry PROFILE.md and RESPONSIBILITIES.md;
 * importing one merges them by ruling P14. The handle is the
 * upsert key — importing an existing handle replaces that agent's content and
 * settings. A `packageVersion` in an older archive's agent.json is ignored.
 *
 * An uploaded archive is untrusted input (an import requires ADMIN, but the
 * bytes themselves are attacker-controlled): `assertDeclaredSizeEarly` refuses
 * an archive whose *declared* entry count/sizes already exceed the bound —
 * a fast, cheap early rejection — but a declared size cannot be trusted (a
 * hand-crafted central directory can lie about it), so every entry actually
 * read is pulled through `readEntryCounted`, which sums real inflated bytes
 * across the whole archive as they stream out and aborts, before the entry
 * finishes inflating, the moment the running total crosses the cap. A symlink
 * entry is refused outright. Every skill path is checked with
 * `isValidPackagePath` (rejects `..`, absolute and backslash segments) before
 * it is read, and every entry must resolve under the archive's single root
 * folder — except a Finder-zip's `__MACOSX/`/dotfile metadata, which is
 * skipped rather than treated as an escape attempt.
 */
import JSZip from 'jszip'
import { prisma, HttpError } from 'wasp/server'
import { isValidPackagePath, PACKAGE_MAX_BYTES, type ToolPermission, type BashPatternPermission } from '@agenthix/core'
import { createAgent } from './agentService'
import { triggerSnapshotPush } from '../server/dashboard/debouncedPush'
import { INVALID_AGENT_HANDLE_MESSAGE, isValidAgentHandle } from './agentHandle'
import { coerceToolPermissions, coerceBashPatternPermissions } from './toolPermissions'
import {
  writeAgentContent, mergeInstructions, defaultAgentSettings, settingsColumns,
  INSTRUCTIONS_FILE, type AgentContent, type AgentSettings,
} from '../packages/agentPackageService'
import { PackageContentError, type PackageFileInput } from '../packages/packageStore'
import { redrawIfFollowsName } from '../pictures/service'

/** A sane ceiling on how many entries an uploaded archive may carry. */
const MAX_ARCHIVE_ENTRIES = 2000

/** A path's first segment names Finder-zip metadata, not package content. */
function isFinderMetadata(name: string): boolean {
  const first = name.split('/')[0]
  return first.startsWith('__') || first.startsWith('.')
}

export interface AgentArchiveRecord {
  name: string
  handle: string
  role?: string
  /** @deprecated Written so an older HQ still imports the archive; ignored on import. The resolver decides the model. */
  defaultModel?: string
  /** @deprecated Written so an older HQ still imports the archive; ignored on import. The resolver decides the runtime. */
  runtime?: string
  approval?: string
  /** ToolPermission[]; archives from before tool states carry string[] — coerced on import. */
  allowedTools?: ToolPermission[] | string[]
  allowedBashPatterns?: BashPatternPermission[] | string[]
}

export interface ParsedAgentZip {
  record: AgentArchiveRecord
  instructions: string
  skillFiles: PackageFileInput[]
}

/** A `type` alias (not interface) so it satisfies Wasp's SuperJSON Payload constraint. */
export type ImportAgentResult = { agentId: string; handle: string; created: boolean }

/**
 * Cheap, early refusal on an uploaded archive's *declared* shape: too many
 * entries, or declared uncompressed bytes already over the cap, or a
 * non-regular (symlink) entry. JSZip's central-directory parse (`loadAsync`)
 * already knows each entry's declared uncompressed size and unix mode without
 * decompressing its content, so this reads only that metadata — but a
 * declared size is exactly that, declared: a hand-crafted central directory
 * can understate it arbitrarily, so this is a fast-path guard, never the only
 * guard (see `readEntryCounted` below for the one that actually counts).
 */
function assertDeclaredSizeEarly(zip: JSZip): void {
  const entries = Object.values(zip.files)
  if (entries.length > MAX_ARCHIVE_ENTRIES) {
    throw new PackageContentError(`Invalid ZIP: ${entries.length} entries exceeds the limit of ${MAX_ARCHIVE_ENTRIES}`)
  }
  let totalBytes = 0
  for (const file of entries) {
    if (file.dir) continue
    const mode = (file as unknown as { unixPermissions?: number | null }).unixPermissions
    // S_IFLNK (0xA000): a symlink entry could point outside the extracted tree.
    if (typeof mode === 'number' && (mode & 0xf000) === 0xa000) {
      throw new PackageContentError(`Invalid ZIP: ${file.name} is a symlink, not a regular file`)
    }
    totalBytes += (file as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize ?? 0
  }
  if (totalBytes > PACKAGE_MAX_BYTES) {
    throw new PackageContentError(`Invalid ZIP: declared uncompressed content is ${totalBytes} bytes; the limit is ${PACKAGE_MAX_BYTES}`)
  }
}

/**
 * Reads one entry's full content while enforcing `budget` — a running total
 * shared across every entry `parseAgentZip` reads out of one archive. A
 * declared size is untrusted (assertDeclaredSizeEarly's check on it is only a
 * fast path), so this counts real bytes as JSZip's decompression worker
 * produces them and — the moment the running total would cross the cap —
 * stops pulling from the worker for good, rather than first inflating the
 * entry's full, possibly-enormous content into memory.
 */
function readEntryCounted(file: JSZip.JSZipObject, budget: { used: number }): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let settled = false
    // internalStream (the primitive .async()/.nodeStream() are themselves
    // built on, not in JSZip's public .d.ts) needs an explicit .resume() to
    // start flowing — which lets a caller simply never call it again to leave
    // the underlying decompression worker paused for good, aborting the read.
    type StreamHelperLike = {
      on(event: 'data' | 'error' | 'end', cb: (...args: any[]) => void): StreamHelperLike
      resume(): StreamHelperLike
      pause(): StreamHelperLike
    }
    const helper = (file as unknown as { internalStream(type: 'nodebuffer'): StreamHelperLike }).internalStream('nodebuffer')
    helper.on('data', (chunk: Buffer) => {
      if (settled) return
      budget.used += chunk.length
      if (budget.used > PACKAGE_MAX_BYTES) {
        settled = true
        helper.pause()
        reject(new PackageContentError(
          `Invalid ZIP: uncompressed content reached ${budget.used} bytes while streaming ${file.name}; the limit is ${PACKAGE_MAX_BYTES}`,
        ))
        return
      }
      chunks.push(chunk)
    })
    helper.on('error', (err: Error) => {
      if (settled) return
      settled = true
      // An entry that fails to inflate (JSZip's own "uncompressed data size
      // mismatch", a bad CRC) is a malformed upload, not a server fault.
      reject(new PackageContentError(`Invalid ZIP: ${file.name} could not be read: ${err.message}`))
    })
    helper.on('end', () => {
      if (settled) return
      settled = true
      resolve(Buffer.concat(chunks))
    })
    helper.resume()
  })
}

export async function parseAgentZip(buffer: Buffer): Promise<ParsedAgentZip> {
  const zip = await JSZip.loadAsync(buffer)
  assertDeclaredSizeEarly(zip)
  const fileNames = Object.keys(zip.files)
  const rootDir = [...new Set(fileNames.filter(f => f.includes('/')).map(f => f.split('/')[0]))]
    .find(d => d && !isFinderMetadata(d))
  if (!rootDir) throw new PackageContentError('Invalid ZIP: no root directory found')
  const prefix = `${rootDir}/`
  // Every entry must live under the archive's single root folder — except a
  // Finder-zip's own `__MACOSX/` AppleDouble sibling and dotfiles (`.DS_Store`
  // and the like), which are metadata, not content, and are skipped rather
  // than treated as an escape attempt. A crafted `..` segment (e.g.
  // `scout/skills/../../evil.md`) still resolves outside the root and is
  // rejected — the whole archive refuses rather than silently dropping what
  // escaped.
  for (const name of fileNames) {
    if (isFinderMetadata(name)) continue
    if (!name.startsWith(prefix)) throw new PackageContentError(`Invalid ZIP: unsafe path ${name}`)
  }

  const budget = { used: 0 }
  const read = async (relative: string): Promise<string | null> => {
    const file = zip.file(prefix + relative)
    return file ? (await readEntryCounted(file, budget)).toString('utf-8') : null
  }

  const recordJson = await read('agent.json')
  if (!recordJson) throw new PackageContentError('Invalid ZIP: agent.json not found')
  let record: AgentArchiveRecord
  try {
    record = JSON.parse(recordJson)
  } catch {
    throw new PackageContentError('Invalid ZIP: agent.json is not valid JSON')
  }
  if (!record.name || !record.handle) throw new PackageContentError('Invalid agent.json: "name" and "handle" are required')

  const skillFiles: PackageFileInput[] = []
  for (const [filePath, file] of Object.entries(zip.files)) {
    if (file.dir || !filePath.startsWith(`${prefix}skills/`)) continue
    const relative = filePath.slice(prefix.length)
    if (!isValidPackagePath(relative)) throw new PackageContentError(`Invalid ZIP: unsafe path ${relative}`)
    skillFiles.push({ path: relative, content: await readEntryCounted(file, budget) })
  }
  // Ordinal, not locale-collated: package file order must be stable across
  // environments.
  skillFiles.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))

  return {
    record,
    instructions: (await read(INSTRUCTIONS_FILE)) ?? mergeInstructions(await read('PROFILE.md'), await read('RESPONSIBILITIES.md')),
    skillFiles,
  }
}

function settingsFromRecord(record: AgentArchiveRecord): AgentSettings {
  const base = defaultAgentSettings()
  return {
    ...base,
    approval: record.approval ?? base.approval,
    permissions: {
      tools: record.allowedTools == null ? null : coerceToolPermissions(record.allowedTools),
      bashPatterns: record.allowedBashPatterns == null ? null : coerceBashPatternPermissions(record.allowedBashPatterns),
    },
  }
}

export async function importAgentZip(buffer: Buffer, importedById: string | null): Promise<ImportAgentResult> {
  const { record, instructions, skillFiles } = await parseAgentZip(buffer)
  if (!isValidAgentHandle(record.handle)) throw new HttpError(400, INVALID_AGENT_HANDLE_MESSAGE)
  const content: AgentContent = { instructions, skillFiles }
  const settings = settingsFromRecord(record)

  const existing = await prisma.agent.findUnique({ where: { handle: record.handle } })
  let agentId: string
  let created: boolean
  if (existing) {
    // One transaction: the settings are validated before anything is written,
    // and the content, settings and identity ride the same transaction, so
    // neither a bad archive nor a failed rename leaves half an import behind.
    const columns = settingsColumns(settings)
    await prisma.$transaction(async tx => {
      await writeAgentContent(existing.id, content, importedById, tx)
      await tx.agent.update({ where: { id: existing.id }, data: { name: record.name, role: record.role, ...columns } })
    })
    triggerSnapshotPush()
    if (existing.name !== record.name) await redrawIfFollowsName({ kind: 'agent', id: existing.id })
    agentId = existing.id
    created = false
  } else {
    // createAgent validates settings before writing anything, so it is
    // already atomic on its own.
    const agent = await createAgent({
      name: record.name,
      handle: record.handle,
      role: record.role,
      initialContent: content,
      settings,
      createdById: importedById,
    })
    agentId = agent.id
    created = true
  }

  return { agentId, handle: record.handle, created }
}
