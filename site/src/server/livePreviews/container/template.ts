/**
 * The one template every live preview's container is made from (live preview spec section 6), and the
 * `docker create` arguments that make it. Pure: the guard compares what Docker reports with the same template
 * (`inspect.ts`), so what is made and what is checked cannot be two descriptions.
 *
 * The app's container runs the app's own code with network access, so it is held tighter than an agent's: its one
 * bind is the copy it runs from (never the workspace's folder, another copy, any storage or the site's data); no
 * capability, no new privileges, a read-only root, memory-backed `/tmp`, commands' home and secrets' folder
 * (`secrets/handedSecrets.ts`), Docker's init, its own
 * IPC namespace, IPv6 off, no Docker socket, no published port, no extra host. Its network is its own, in the
 * live-preview part of the agents' range, where the host service drops anything bound for a private address.
 */
import path from 'node:path'
import { ipv6OffSysctls, sysctlArgs } from '../../../agents/runtime/ipv6Off'
import { agentNetworkName } from '../../../agents/runtime/containerNetwork'
import { budgetArgs, budgetTmpfs, type LivePreviewBudget } from './budget'
import { livePreviewContainerName, livePreviewLabels, type LabelledPreview } from './labels'
import { LIVE_PREVIEW_SECRETS_DIR } from '@agenthix/core'
import { SECRETS_TMPFS } from '../secrets/secretsFolder'

export type LivePreviewMount = { source: string; target: string; readOnly: boolean }

export type LivePreviewTemplate = {
  name: string
  image: string
  labels: Record<string, string>
  mounts: LivePreviewMount[]
  user: string
  network: string
  /** Networks it may also be on: its services' network, once one is made. */
  extraNetworks?: string[]
  readOnlyRoot: boolean
  capAdd: string[]
  capDrop: string[]
  securityOpt: string[]
  sysctls: Record<string, string>
  tmpfs: Record<string, string>
  command: string[]
  budget: LivePreviewBudget
}

/** The image's user, `appuser`, by number: Docker reports what it was given. */
export const LIVE_PREVIEW_USER = '1001:1001'
export const LIVE_PREVIEW_COMMAND = ['tail', '-f', '/dev/null']

export type CopyBind = { hostDir: string; containerDir: string }

export function buildTemplate(lp: LabelledPreview, copy: CopyBind, budget: LivePreviewBudget, image: string): LivePreviewTemplate {
  const name = livePreviewContainerName(lp.id)
  return {
    name,
    image,
    labels: livePreviewLabels(lp),
    mounts: [{ source: copy.hostDir, target: copy.containerDir, readOnly: false }],
    user: LIVE_PREVIEW_USER,
    network: agentNetworkName(name),
    readOnlyRoot: true,
    capAdd: [],
    capDrop: ['ALL'],
    securityOpt: ['no-new-privileges'],
    sysctls: ipv6OffSysctls(),
    tmpfs: { ...budgetTmpfs(budget), [LIVE_PREVIEW_SECRETS_DIR]: SECRETS_TMPFS },
    command: LIVE_PREVIEW_COMMAND,
    budget,
  }
}

/** A `--mount` value; a comma or a quote would let a path add options of its own, so neither is accepted. */
export function mountArg(m: LivePreviewMount): string {
  for (const p of [m.source, m.target]) {
    if (!path.isAbsolute(p) || /[,"'\n]/.test(p)) throw new Error(`Refusing a live preview mount with an unusable path: ${JSON.stringify(p)}`)
  }
  return `type=bind,source=${m.source},target=${m.target}${m.readOnly ? ',readonly' : ''}`
}

/** `docker create` for the template: made, not started, so it can be inspected before it runs. */
export function createArgs(t: LivePreviewTemplate): string[] {
  return [
    'create',
    '--name', t.name,
    '--network', t.network,
    '--user', t.user,
    ...Object.entries(t.labels).flatMap(([k, v]) => ['--label', `${k}=${v}`]),
    ...t.mounts.flatMap(m => ['--mount', mountArg(m)]),
    ...Object.entries(t.tmpfs).flatMap(([p, opts]) => ['--tmpfs', `${p}:${opts}`]),
    ...t.capDrop.flatMap(c => ['--cap-drop', c]),
    ...t.capAdd.flatMap(c => ['--cap-add', c]),
    ...t.securityOpt.flatMap(o => ['--security-opt', o]),
    ...sysctlArgs(t.sysctls),
    ...(t.readOnlyRoot ? ['--read-only'] : []),
    '--ipc', 'private',
    '--init',
    '--restart', 'no',
    ...budgetArgs(t.budget),
    '--entrypoint', '',
    t.image,
    ...t.command,
  ]
}
