/**
 * A file's path inside a workflow version: relative to the definition file's folder, written with `/`, and
 * normalised so one file has exactly one spelling (spec part 1, *A version*). The same path is where the site writes
 * the file under `/run/workflow`, so a path that could climb out of that folder is refused, never cleaned up.
 */
export const WORKFLOW_PATH_MAX = 255
const SEGMENT_RE = /^[A-Za-z0-9._@+-]+$/

export type NormalisedPath = { ok: true; path: string } | { ok: false; reason: string }

/** `./deploy/upload.sh` → `deploy/upload.sh`. Refuses absolute paths, `..`, empty or `.`-only segments. */
export function normaliseWorkflowPath(raw: string): NormalisedPath {
  if (raw.includes('\0')) return { ok: false, reason: 'A path cannot contain a NUL character.' }
  if (raw.includes('\\')) return { ok: false, reason: `"${raw}" uses \\: write paths with /.` }
  if (raw.startsWith('/')) return { ok: false, reason: `"${raw}" is absolute: give the path relative to the workflow's folder.` }
  const segments = raw.split('/')
  while (segments[0] === '.') segments.shift()
  if (segments.length === 0 || segments.some(s => s === '')) {
    return { ok: false, reason: `"${raw}" is not a file path: it has an empty part.` }
  }
  for (const s of segments) {
    if (s === '.' || s === '..') return { ok: false, reason: `"${raw}" may not contain . or .. after its start.` }
    if (!SEGMENT_RE.test(s)) {
      return { ok: false, reason: `"${raw}" has a character a workflow's file name can't: use letters, digits and . _ @ + -.` }
    }
    if (s.startsWith('-')) return { ok: false, reason: `"${raw}" has a part starting with -, which a command would read as an option.` }
  }
  const path = segments.join('/')
  if (path.length > WORKFLOW_PATH_MAX) return { ok: false, reason: `A path is at most ${WORKFLOW_PATH_MAX} characters.` }
  return { ok: true, path }
}

/**
 * The version file a step's `run` names, when its first word is a path starting `./`: `./deploy/upload.sh --fast`
 * names `deploy/upload.sh`. Null when the step runs a command instead.
 */
export function fileNamedByRun(run: string): string | null {
  const first = run.trimStart().split(/\s/, 1)[0] ?? ''
  if (!first.startsWith('./')) return null
  const normalised = normaliseWorkflowPath(first)
  return normalised.ok ? normalised.path : first
}
