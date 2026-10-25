/**
 * The approved version's files, written to the run's `workflow/` folder, which every step has read-only at
 * `/run/workflow` (workflows spec part 2, *What runs is the approved files*). Written from the run instruction's
 * bytes after the hash has been checked, never read from the workspace, so what runs is what was approved. The
 * folder is the site's own and new for the run, so plain paths are safe here; each path has been through core's
 * `normaliseWorkflowPath` as part of the hash check.
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import type { WorkflowVersionFile } from '@agenthix/core'

export const WORKFLOW_MOUNT = '/run/workflow'
export const OUT_MOUNT = '/run/out'

export async function writeApprovedFiles(dir: string, files: WorkflowVersionFile[]): Promise<void> {
  for (const f of files) {
    const to = path.join(dir, ...f.path.split('/'))
    if (!to.startsWith(dir + path.sep)) throw new Error(`${f.path} is not inside the workflow's folder.`)
    await fs.mkdir(path.dirname(to), { recursive: true, mode: 0o755 })
    await fs.writeFile(to, f.bytes, { flag: 'wx', mode: 0o600 })
    await fs.chmod(to, f.executable ? 0o755 : 0o644)
  }
}

/**
 * A step's command with a leading `./path` that names one of the version's files pointed at `/run/workflow`, so
 * `./deploy/upload.sh --fast` runs the version's `deploy/upload.sh` and never a file of the same name in the workspace.
 */
export function commandForStep(run: string, files: ReadonlySet<string>, fileNamed: string | null): string {
  if (fileNamed === null || !files.has(fileNamed)) return run
  const start = run.length - run.trimStart().length
  const first = run.slice(start).split(/\s/, 1)[0] ?? ''
  return `${run.slice(0, start)}${WORKFLOW_MOUNT}/${fileNamed}${run.slice(start + first.length)}`
}
