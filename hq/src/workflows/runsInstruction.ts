/**
 * The run instruction (core's `WorkflowRunInstruction`), built from the approved version and the values hq holds.
 * Each step gets only the secrets it names; masking gets every secret of the place and every minted value that
 * hasn't expired, as keyed hashes only (`runsMasking.ts`). The instruction is the one message that carries values in
 * plain, so it is built just before it is sent and never stored or logged.
 */
import {
  WORKFLOW_CONTAINER_LIMITS,
  type WorkflowDefinition,
  type WorkflowRunGitHub,
  type WorkflowRunInstruction,
  type WorkflowRunLivePreview,
  type WorkflowRunWorkspace,
} from '@agenthix/core'
import { buildMaskingMaterial } from './runsMasking'

export type InstructionInput = {
  runId: string
  version: {
    hash: string
    definition: WorkflowDefinition
    files: { path: string; content: Uint8Array; executable: boolean }[]
    githubSecretNames: string[]
    executorImageDigest: string
  }
  workspace: WorkflowRunWorkspace
  /** Every secret of the place, by name: the run's steps get those they name, masking gets them all. */
  placeSecrets: Map<string, Buffer>
  /** Values minted for this run, by name, such as GITHUB_TOKEN. */
  minted: Map<string, Buffer>
  /** Every unexpired minted value of the place, this run's included, for masking only. */
  mintedForMasking: { name: string; value: Buffer }[]
  variables: Record<string, string>
  parameters: Record<string, string>
  github: WorkflowRunGitHub | null
  livePreview?: WorkflowRunLivePreview
}

export function buildRunInstruction(input: InstructionInput): WorkflowRunInstruction {
  const { version: v } = input
  const steps = v.definition.steps.map((step) => ({
    secrets: Object.fromEntries(step.secrets.map((name) => {
      const value = input.minted.get(name) ?? input.placeSecrets.get(name)
      // runs.ts has checked every name exists; a missing one here is a fault, never an empty value.
      if (!value) throw new Error(`No value for ${name}`)
      return [name, value.toString('base64')]
    })),
  }))
  const masking = buildMaskingMaterial([
    ...[...input.placeSecrets].map(([name, value]) => ({ name, value })),
    ...input.mintedForMasking,
    ...[...input.minted].map(([name, value]) => ({ name, value })),
  ])
  return {
    runId: input.runId,
    versionHash: v.hash,
    definition: v.definition,
    files: v.files.map((f) => ({ path: f.path, contentBase64: Buffer.from(f.content).toString('base64'), executable: f.executable })),
    githubSecretNames: v.githubSecretNames,
    executorImageDigest: v.executorImageDigest,
    workspace: input.workspace,
    steps,
    variables: input.variables,
    parameters: input.parameters,
    limits: WORKFLOW_CONTAINER_LIMITS,
    masking,
    github: input.github,
    ...(input.livePreview ? { livePreview: input.livePreview } : {}),
  }
}
