/**
 * What the control checks in this folder share (workflows spec part 6, *Each attack, and what stops it*): a run of
 * the real executor to its end, an agent container started with the site's own `docker run` arguments, and what
 * `docker inspect` says of a container. The test files mock `#db` and the run's events themselves, since a mock is
 * per test file. Every container and network here is named `wf-lane-6b-*` and capped at 2 GB and 2 CPUs.
 */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs/promises'
import { expect, vi } from 'vitest'
import type { WorkflowRunInstruction, WorkflowRunResult } from '@agenthix/core'
import { buildContainerRunCommand } from '../../../agents/runtime/containerRunArgs'
import { prepareHarnessHome } from '../../../agents/runtime/boundaryClaudeHome'
import { prepareRunStaging } from '../../../agents/runtime/runStaging'
import { prepareOpenCodeConfigMounts } from '../../../agents/runtime/openCodeConfigMounts'
import type { ContainerKey } from '../../../agents/runtime/containerTypes'
import { getRun, startRun } from '../../run'

export const NAMESPACE = 'wf-lane-6b'
export const EXECUTOR_IMAGE = process.env.EXECUTOR_TEST_IMAGE ?? 'imgtest/executor:dev'
export const AGENT_IMAGE = process.env.AGENT_TEST_IMAGE ?? 'imgtest/agent:dev'
export const AGENT = `${NAMESPACE}-agent`
export const AGENT_NET = `${NAMESPACE}-agent-net`

export type Run = { status: number | null; stdout: string; stderr: string }
export function sh(cmd: string, args: string[], timeout = 120_000): Run {
  const r = spawnSync(cmd, args, { encoding: 'utf8', timeout })
  return { status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' }
}

/** The image's id, or '' when Docker or the image is missing (the checks are then skipped). */
export function imageId(image: string): string {
  const r = sh('docker', ['image', 'inspect', '--format', '{{.Id}}', image])
  return r.status === 0 ? r.stdout.trim() : ''
}

/** Starts a run and waits for its result. */
export async function runToEnd(ins: WorkflowRunInstruction): Promise<WorkflowRunResult> {
  expect(await startRun(ins)).toEqual({ accepted: true })
  await vi.waitFor(async () => expect((await getRun({ runId: ins.runId }))?.result).toBeTruthy(), { timeout: 120_000, interval: 250 })
  return (await getRun({ runId: ins.runId }))!.result!
}

/**
 * An agent container for project `ownerId`, started as the site starts one (`buildContainerRunCommand`): its harness
 * home under SITE_ROOT, its storage boundary bound read-write, on a network of its own.
 */
export async function startAgent(ownerId: string, boundaryHostDir: string): Promise<void> {
  removeAgent()
  const key: ContainerKey = { scope: 'storage', ownerType: 'project', ownerId, mode: 'rw', runner: { kind: 'project', projectId: ownerId } }
  await prepareHarnessHome(key)
  await prepareOpenCodeConfigMounts(key)
  await prepareRunStaging(key)
  const net = sh('docker', ['network', 'create', AGENT_NET])
  if (net.status !== 0) throw new Error(net.stderr)
  process.env.AGENT_IMAGE = AGENT_IMAGE
  const { args } = buildContainerRunCommand(
    key, { handle: 'coder', runtime: 'claude', sessionId: 'sess-6b', credential: null }, AGENT,
    { boundary: { hostDir: boundaryHostDir, containerDir: `/projects/${ownerId}` }, folders: [], locationMode: 'rw' },
    AGENT_NET, { memory: '2g', pidsLimit: '1024', cpus: '2' },
  )
  const r = sh('docker', args)
  if (r.status !== 0) throw new Error(r.stderr)
}

export function removeAgent(): void {
  sh('docker', ['rm', '-f', AGENT])
  sh('docker', ['network', 'rm', AGENT_NET])
}

/** A command in the agent container as the image's user, as the harness runs one. */
export function inAgent(script: string): Run {
  return sh('docker', ['exec', '-u', 'appuser', AGENT, 'bash', '-c', script])
}

export type Isolation = {
  id: string
  networks: string[]
  networkMode: string
  pidMode: string
  ipcMode: string
  utsMode: string
  mounts: { source: string; destination: string }[]
}

/** What `docker inspect` says of a container's namespaces and mounts. */
export function isolationOf(name: string): Isolation {
  const r = sh('docker', ['inspect', '--format', '{{json .}}', name])
  if (r.status !== 0) throw new Error(r.stderr)
  const c = JSON.parse(r.stdout) as {
    Id: string
    HostConfig: { NetworkMode: string; PidMode: string; IpcMode: string; UTSMode: string }
    NetworkSettings: { Networks: Record<string, unknown> | null }
    Mounts: { Source: string; Destination: string }[] | null
  }
  return {
    id: c.Id,
    networks: Object.keys(c.NetworkSettings.Networks ?? {}),
    networkMode: c.HostConfig.NetworkMode,
    pidMode: c.HostConfig.PidMode,
    ipcMode: c.HostConfig.IpcMode,
    utsMode: c.HostConfig.UTSMode,
    mounts: (c.Mounts ?? []).map(m => ({ source: m.Source, destination: m.Destination })),
  }
}
