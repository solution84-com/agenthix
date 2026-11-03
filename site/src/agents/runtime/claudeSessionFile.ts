/**
 * Where Claude Code files a session, and whether that file is there
 * (person-scoped execution spec §4, adr-0076).
 *
 * Claude Code writes each session's transcript to
 * `<config dir>/projects/<project folder>/<session id>.jsonl`, where the config
 * dir is `$CLAUDE_CONFIG_DIR` or `~/.claude`, and the project folder is the
 * process's working directory (its real path, NFC-normalised) with every
 * character outside `[a-zA-Z0-9]` replaced by `-`. A name longer than 200
 * characters is cut to 200 and suffixed with `-` and a base-36 hash of the
 * whole path. Read from `@anthropic-ai/claude-agent-sdk` 0.2.141: `sdk.mjs`'s
 * session lookup (`M0`, `H4`, `$g`, `M6`, `j1`) and the bundled CLI's own
 * (`sY`, `Pk`, `UZ`, `kT`, and `yY_`, the check behind "Session ID … is
 * already in use").
 *
 * A long name is matched on its 200-character prefix, as the SDK's own lookup
 * does, rather than by recomputing the hash — the hash is an implementation
 * detail that a different Claude Code build could compute differently, and a
 * wrong hash here would close a healthy conversation.
 *
 * A file that exists but is empty does not count: the SDK's own lookup skips
 * it, and there is nothing in it to resume.
 */
import path from 'node:path'
import { closeDir, LinkRefused, lstatIn, namesIn, openDirPath, openRoot, type Dir } from './safeTree'

const MAX_PROJECT_FOLDER_NAME = 200

/** The project folder name Claude Code files a working directory's sessions under (before any truncation). */
export function claudeProjectFolderName(workingDirectory: string): string {
  return workingDirectory.normalize('NFC').replace(/[^a-zA-Z0-9]/g, '-')
}

/**
 * Whether `sessionId`'s transcript is in `configDir` for `workingDirectory`.
 * Only "not there" answers false; any other failure to read (a permission
 * error, say) is thrown, because a false answer closes the conversation.
 *
 * Read from `trustedRoot` (the harness home, for a run in a container) down,
 * one folder at a time and never through a link (`safeTree.ts`): the run
 * writes its home, and a link there could otherwise answer from another home.
 * A link where a folder or the transcript should be counts as not there.
 */
export async function claudeSessionFileExists(
  configDir: string,
  workingDirectory: string,
  sessionId: string,
  trustedRoot: string = configDir,
): Promise<boolean> {
  if (!/^[A-Za-z0-9-]+$/.test(sessionId)) {
    throw new Error(`Refusing to look up a Claude session with an unexpected id: ${JSON.stringify(sessionId)}`)
  }
  const relative = path.relative(trustedRoot, configDir)
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Refusing a Claude folder outside its home')
  let root: Dir
  try {
    root = await openRoot(trustedRoot)
  } catch (err) {
    if (isAbsent(err)) return false
    throw err
  }
  try {
    const projects = await openDirPath(root, [...relative.split(path.sep), 'projects'].filter(Boolean).join('/'))
    if (!projects) return false
    try {
      for (const folder of await candidateFolders(projects, claudeProjectFolderName(workingDirectory))) {
        if (await nonEmptyFile(projects, folder, `${sessionId}.jsonl`)) return true
      }
      return false
    } finally {
      await closeDir(projects, root)
    }
  } catch (err) {
    if (err instanceof LinkRefused || isAbsent(err)) return false
    throw err
  } finally {
    await closeDir(root)
  }
}

async function candidateFolders(projects: Dir, name: string): Promise<string[]> {
  if (name.length <= MAX_PROJECT_FOLDER_NAME) return [name]
  const prefix = `${name.slice(0, MAX_PROJECT_FOLDER_NAME)}-`
  return (await namesIn(projects)).filter(n => n.startsWith(prefix))
}

async function nonEmptyFile(projects: Dir, folder: string, file: string): Promise<boolean> {
  const dir = await openDirPath(projects, folder).catch(err => {
    if (err instanceof LinkRefused) return null
    throw err
  })
  if (!dir) return false
  try {
    const stat = await lstatIn(dir, file)
    return !!stat && stat.isFile() && stat.size > 0n
  } finally {
    await closeDir(dir, projects)
  }
}

function isAbsent(err: unknown): boolean {
  const code = (err as NodeJS.ErrnoException | null)?.code
  return code === 'ENOENT' || code === 'ENOTDIR'
}
