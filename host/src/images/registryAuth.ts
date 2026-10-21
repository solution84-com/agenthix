/**
 * Registry credentials for a machine that pulls images from a private registry (staging only; once the packages
 * are public neither is needed). Both are read from the host service's environment, which `host.env` fills. The
 * host service writes them to a Docker client configuration of its own in its state folder, never the machine's
 * `~/.docker`, and hands only that folder's path (`DOCKER_CONFIG`) to the image pull and to the signature check.
 * The credential itself is never logged, never in a request or an envelope, and never given to a child process,
 * a container or anything it starts: `childEnv` drops it from what every spawned command inherits.
 */
import fs from 'node:fs'
import type { StateFolder } from '../state/folder'
import { REGISTRY } from './published'

export const REGISTRY_USERNAME_VAR = 'REGISTRY_USERNAME'
export const REGISTRY_TOKEN_VAR = 'REGISTRY_TOKEN'

/** What a command is given to reach the registry: only the path of the client configuration. */
export type RegistryEnv = { DOCKER_CONFIG: string }

const REGISTRY_HOST = REGISTRY.split('/')[0]
const CONFIG_FOLDER = ['registry', 'docker'] as const

/**
 * The client configuration for the registry, written fresh; undefined (and any earlier one removed, so a revoked
 * credential does not linger) unless both variables are set.
 */
export function registryEnv(state: StateFolder, env: NodeJS.ProcessEnv): RegistryEnv | undefined {
  const username = env[REGISTRY_USERNAME_VAR]
  const token = env[REGISTRY_TOKEN_VAR]
  const dir = state.path(...CONFIG_FOLDER)
  if (!username || !token) {
    fs.rmSync(dir, { recursive: true, force: true })
    return undefined
  }
  const auth = Buffer.from(`${username}:${token}`).toString('base64')
  state.folder(...CONFIG_FOLDER)
  state.writePrivate([...CONFIG_FOLDER, 'config.json'], `${JSON.stringify({ auths: { [REGISTRY_HOST]: { auth } } }, null, 2)}\n`)
  return { DOCKER_CONFIG: dir }
}

/** The environment of a spawned command: the host service's own, without the registry credential, plus `extra`. */
export function childEnv(base: NodeJS.ProcessEnv, extra?: RegistryEnv): NodeJS.ProcessEnv {
  const { [REGISTRY_USERNAME_VAR]: _user, [REGISTRY_TOKEN_VAR]: _token, ...rest } = base
  return { ...rest, ...extra }
}
