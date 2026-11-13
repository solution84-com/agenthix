/**
 * Where things are inside the host service's container. The owner socket stays inside the container, outside
 * the state folder, so only `docker exec` reaches it. The figures socket is in a named volume, `<ns>-host-figures`,
 * mounted here and read-only into the site: a socket in a bind-mounted folder does not work on Docker Desktop.
 */
import os from 'node:os'
import { CLOUD_URL_SETTING } from '@agenthix/core'
import type { StateFolder } from './state/folder'
import { cloudFeatureOn } from './cloud/flag'
import { STATE_MOUNT } from './service/context'

export const STATE_DIR = process.env.HOST_STATE_DIR || STATE_MOUNT
export const OWNER_SOCKET = process.env.HOST_OWNER_SOCKET || '/run/host/owner.sock'
/** Where the figures volume is mounted, in the host service's container and in the site's alike. */
export const FIGURES_MOUNT = '/run/host-figures'
export const FIGURES_SOCKET = `${FIGURES_MOUNT}/figures.sock`

/**
 * The machine's own name, recorded at first start: with `--network host` the container has the machine's host
 * name. A site's name defaults to it, and from then on the two are stored apart (spec §6).
 */
export function machineName(state: StateFolder): string {
  const stored = state.readJson('machine.json') as { name?: unknown } | null
  if (stored && typeof stored.name === 'string' && stored.name) return stored.name
  const name = (process.env.HOST_MACHINE_NAME || os.hostname() || 'this-machine').split('.')[0]
  state.writeJson(['machine.json'], { ...(stored ?? {}), name })
  return name
}

export const CLOUD_URL_VAR = CLOUD_URL_SETTING
export const CLOUD_MACHINE_ID_VAR = 'CLOUD_MACHINE_ID'
export const CLOUD_ENROLMENT_CODE_FILE_VAR = 'CLOUD_ENROLMENT_CODE_FILE'

/**
 * Agenthix Cloud's controller, from the host service's start-up settings (`--env-file /etc/agenthix/host.env` on its
 * `docker run`), set only on a machine Cloud runs. The code file's path is as this container sees it. Null without
 * `CLOUD_URL`, or while Agenthix Cloud's flag is off (adr-0189; read from this process's own build, never `env`): the
 * machine then behaves as one an organisation runs itself.
 */
export type CloudSettings = { url: string; machineId: string | null; enrolmentCodeFile: string | null }

export function cloudSettings(env: NodeJS.ProcessEnv = process.env): CloudSettings | null {
  const url = env[CLOUD_URL_VAR]?.trim()
  if (!url || !cloudFeatureOn()) return null
  return {
    url,
    machineId: env[CLOUD_MACHINE_ID_VAR]?.trim() || null,
    enrolmentCodeFile: env[CLOUD_ENROLMENT_CODE_FILE_VAR]?.trim() || null,
  }
}
