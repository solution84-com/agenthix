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
import fs from 'node:fs/promises'
import path from 'node:path'

const MAX_PROJECT_FOLDER_NAME = 200

/** The project folder name Claude Code files a working directory's sessions under (before any truncation). */
export function claudeProjectFolderName(workingDirectory: string): string {
  return workingDirectory.normalize('NFC').replace(/[^a-zA-Z0-9]/g, '-')
}

/**
 * Whether `sessionId`'s transcript is in `configDir` for `workingDirectory`.
 * Only "not there" answers false; any other failure to read (a permission
 * error, say) is thrown, because a false answer closes the conversation.
 */
export async function claudeSessionFileExists(
  configDir: string,
  workingDirectory: string,
  sessionId: string,
): Promise<boolean> {
  if (!/^[A-Za-z0-9-]+$/.test(sessionId)) {
    throw new Error(`Refusing to look up a Claude session with an unexpected id: ${JSON.stringify(sessionId)}`)
  }
  const projectsDir = path.join(configDir, 'projects')
  for (const folder of await candidateFolders(projectsDir, claudeProjectFolderName(workingDirectory))) {
    if (await nonEmptyFile(path.join(projectsDir, folder, `${sessionId}.jsonl`))) return true
  }
  return false
}

async function candidateFolders(projectsDir: string, name: string): Promise<string[]> {
  if (name.length <= MAX_PROJECT_FOLDER_NAME) return [name]
  const prefix = `${name.slice(0, MAX_PROJECT_FOLDER_NAME)}-`
  try {
    const entries = await fs.readdir(projectsDir, { withFileTypes: true })
    return entries.filter(e => e.isDirectory() && e.name.startsWith(prefix)).map(e => e.name)
  } catch (err) {
    if (isAbsent(err)) return []
    throw err
  }
}

async function nonEmptyFile(file: string): Promise<boolean> {
  try {
    const stat = await fs.stat(file)
    return stat.isFile() && stat.size > 0
  } catch (err) {
    if (isAbsent(err)) return false
    throw err
  }
}

function isAbsent(err: unknown): boolean {
  const code = (err as NodeJS.ErrnoException | null)?.code
  return code === 'ENOENT' || code === 'ENOTDIR'
}
