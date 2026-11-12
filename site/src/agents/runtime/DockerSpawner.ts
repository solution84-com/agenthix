import { spawn, type ChildProcess } from 'node:child_process'
import { refuseContainerInDemo } from '../../demo/runtime/noContainers'
import type { SpawnOptions, SpawnedProcess } from '@anthropic-ai/claude-agent-sdk'

/**
 * Starts `claude` with `docker exec` inside an already-running agent container.
 *
 * The SDK's options.env (which contains the full app environment including DB
 * credentials and secrets) is intentionally discarded. Only PATH is passed so
 * the docker CLI binary can be found.
 *
 * @param extraEnv - The `claude` process's own environment: everything that is
 *   the process's rather than the container's — the conversation's tag, the
 *   command launcher, the platform token for git, and the credential access.
 *   Named on the command line as `-e KEY` and valued in the docker client's own
 *   environment, so a value such as a token is never an argv element (the
 *   process table shows every argument to every user on the host).
 */
export function spawnDockerClaude(containerName: string, extraEnv: Record<string, string> | undefined, options: SpawnOptions): ChildProcess {
  // The SDK passes cwd as SpawnOptions.cwd (OS-level process working directory),
  // not as a --cwd CLI flag. docker exec accepts -w/--workdir to set the working
  // directory inside the container.
  refuseContainerInDemo()
  const workdirArgs = options.cwd ? ['-w', options.cwd] : []
  const envArgs = extraEnv ? Object.keys(extraEnv).flatMap(k => ['-e', k]) : []
  // options.command is the host-side binary path (e.g. /Users/xxx/.local/bin/claude)
  // which does not exist inside the container. The image has claude on its global
  // PATH via `npm install -g`, so we always use the bare `claude` command.
  return spawn(
    'docker',
    ['exec', '-i', ...workdirArgs, ...envArgs, containerName, 'claude', ...options.args],
    {
      env: { PATH: process.env.PATH ?? '', ...extraEnv },
      signal: options.signal,
    }
  )
}

/** `spawnDockerClaude` in the shape of the SDK's `spawnClaudeCodeProcess` option. */
export function buildDockerSpawnFn(containerName: string, extraEnv?: Record<string, string>) {
  return (options: SpawnOptions): SpawnedProcess =>
    spawnDockerClaude(containerName, extraEnv, options) as unknown as SpawnedProcess
}
