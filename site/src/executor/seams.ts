/**
 * The three places the executor's run hands work to another part of the site (workflows spec part 2): a run's
 * network, the masker every byte of output passes through, and the scan of the files a run changed. The run
 * (`run.ts`) calls only these; the egress proxy (`egress/`) and masking (`masking/`) put their implementations here
 * in place of the defaults below.
 *
 * All three are real: the run's network and its egress proxy (egress/), masking and the changed-file scan (masking/).
 */
import type { WorkflowHost, WorkflowLeak, WorkflowMaskingMaterial } from '@agenthix/core'
import { startRunNetwork, sweepEgress } from './egress/runNetwork'
import { createFormMasker } from './masking/masker'
import { scanChanges } from './masking/scan'

export type RunNetwork = {
  /** What `docker run` is given for this run's network: `--network`, and `--dns` when there is a proxy. */
  dockerArgs: string[]
  /** Removes whatever the network needed; safe to call twice. */
  release(): Promise<void>
}

/** Thrown when a run can't have the network it asks for; its message is for people and ends "Nothing was changed.". */
export class RunNetworkRefused extends Error {}

export type Masker = {
  /**
   * Masked bytes ready to send; a stretch that may be the start of a secret is held back until the next chunk.
   * Asynchronous, so masking gives the event loop turns; calls are taken in the order made.
   */
  push(chunk: Uint8Array): Promise<Uint8Array>
  /** Everything still held back, masked, once every earlier push is done. */
  end(): Promise<Uint8Array>
  /** The secrets found and masked so far, by name: the run is flagged *printed a secret*. */
  printed(): string[]
}

/** One path the run changed in its snapshot, relative to the snapshot's root. */
export type RunChange =
  | { kind: 'file'; path: string; created: boolean }
  | { kind: 'link'; path: string; created: boolean }
  | { kind: 'dir'; path: string }
  | { kind: 'deleted'; path: string }

export type ScanRunChangesInput = {
  runId: string
  /** The run's snapshot, on the site's disk. */
  snapshotDir: string
  /** The run's `/run/out`, on the site's disk: everything in it is scanned. */
  outDir: string
  /** What the run created or changed, found by content against the start. */
  changes: RunChange[]
  material: WorkflowMaskingMaterial
}

export type ScanRunChangesResult = { leaks: WorkflowLeak[] }

/** The secret name a leak gets when nothing could look for one. */
export const UNSCANNED_SECRET = '(not scanned)'

export async function prepareRunNetwork(runId: string, hosts: WorkflowHost[]): Promise<RunNetwork> {
  return startRunNetwork(runId, hosts)
}

export function createMasker(material: WorkflowMaskingMaterial): Masker {
  return createFormMasker(material)
}

export async function scanRunChanges(input: ScanRunChangesInput): Promise<ScanRunChangesResult> {
  return scanChanges(input)
}

/** Removes every run network a crash left behind, at start-up, when no run is in progress; how many it removed. */
export async function sweepRunNetworks(): Promise<number> {
  return sweepEgress()
}
