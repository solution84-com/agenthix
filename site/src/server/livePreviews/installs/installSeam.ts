/**
 * What the agent's package tools need of the live preview store and container, set at the site's start
 * (`../livePreviewService.ts`). The tools are served on the agent's MCP door, whose code must not reach the control
 * channel's methods; the store and the containers do, so the door reaches them only through these functions.
 */
import type { ExecAnswer, ExecCall, InstallTarget } from './previewInstall'

export type HeldPreview = InstallTarget & { workspaceId: string; branch: string; running: boolean; stopped: boolean }

export type InstallRuntime = {
  previewById(id: string): Promise<HeldPreview | null>
  exec(lp: InstallTarget, argv: string[], opts: ExecCall): Promise<ExecAnswer>
  runGoing(workspaceId: string, branch: string, runId: string): boolean
}

let runtime: InstallRuntime | null = null

export function setInstallRuntime(next: InstallRuntime | null): void {
  runtime = next
}

export function installRuntime(): InstallRuntime | null {
  return runtime
}
