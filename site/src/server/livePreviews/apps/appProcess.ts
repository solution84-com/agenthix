/**
 * One run of an app's command in a live preview's container: started through the sandbox launcher in the app's
 * folder, as a shell that first says its own process id and then becomes the command, so the guard knows the app's
 * process tree by its top process (said before anything of the app's runs, so the app cannot choose it). Its output
 * is kept as its last lines.
 */
import path from 'node:path'
import { lastOutputLines, type AppSpec } from '@agenthix/core'
import type { PreviewSpawned } from '../container/exec'

export const APP_SCRIPT_NAME = 'live-preview-app'
const PID_LINE = /^live-preview-app-pid (\d+)\n/
export const APP_SCRIPT = 'echo "live-preview-app-pid $$"; exec sh -c "$1"'
export const APP_PID_WAIT_MS = 10_000
const OUTPUT_KEPT_CHARS = 64 * 1024

export type AppSpawn = (id: string, root: string, argv: string[], opts: { cwd: string }, onOutput: (chunk: string) => void) => Promise<PreviewSpawned>

export type AppProcess = {
  pid: number
  /** The command's exit code; -1 when its container went. */
  exited: Promise<number>
  alive(): boolean
  lastLines(): string[]
  detach(): void
}

export const appArgv = (command: string): string[] => ['sh', '-c', APP_SCRIPT, APP_SCRIPT_NAME, command]

export function appCwd(root: string, folder: string): string {
  return folder === '' ? root : path.posix.join(root, folder)
}

/** The command could not be started: it never said its process id. */
export class AppStartFailed extends Error {
  constructor(readonly lines: string[]) {
    super('The app\'s command did not start in the live preview.')
  }
}

/** Starts the app's command; answers once its process id is known, or throws when it never says it. */
export async function startAppProcess(spawn: AppSpawn, id: string, root: string, spec: AppSpec): Promise<AppProcess> {
  let output = ''
  let pid: number | null = null
  let said: (pid: number | null) => void = () => {}
  const known = new Promise<number | null>(resolve => { said = resolve })
  const onOutput = (chunk: string) => {
    output = (output + chunk).slice(-OUTPUT_KEPT_CHARS)
    if (pid === null) {
      const m = PID_LINE.exec(output)
      if (m) {
        pid = Number(m[1])
        output = output.slice(m[0].length)
        said(pid)
      }
    }
  }
  const spawned = await spawn(id, root, appArgv(spec.command), { cwd: appCwd(root, spec.folder) }, onOutput)
  let done = false
  void spawned.exited.then(() => {
    done = true
    said(null)
  })
  const timer = setTimeout(() => said(null), APP_PID_WAIT_MS)
  const got = await known
  clearTimeout(timer)
  if (got === null || !Number.isInteger(got) || got <= 1) {
    spawned.detach()
    throw new AppStartFailed(lastOutputLines(output))
  }
  return { pid: got, exited: spawned.exited, alive: () => !done, lastLines: () => lastOutputLines(output), detach: () => spawned.detach() }
}
