/**
 * Reading a run instruction off the wire (workflows spec part 2, step 4): its shape, every name and value the
 * definition allows, the parameters again, and the version's hash recomputed from what arrived, with core's
 * `hashWorkflowVersion` — a run whose content differs from what was approved is refused (attack A8).
 *
 * The instruction holds the plain values of the step's secrets, so no refusal here may quote one: messages name a
 * field by its path and say what is wrong with it, never what it holds.
 */
import { z } from 'zod'
import {
  checkParameterValues, EXECUTOR_IMAGE_DIGEST_RE, GITHUB_PERMISSION_LEVELS, GITHUB_REPOSITORY_PERMISSIONS,
  hashWorkflowVersion, validateParameterName, validateSecretName, validateVariableName, validateWorkflowName,
  WORKFLOW_LIMITS, WORKFLOW_MASK_FORM_CLASSES, WORKFLOW_TIMEOUT_MAX_SECONDS, WORKSPACE_OWNER_TYPES,
  type WorkflowRunInstruction, type WorkflowRunRefusal, type WorkflowVersionFile,
} from '@agenthix/core'
import { isRunId } from './runFolders'

/** One secret's bytes: a private key is about 4 KB, a whole certificate chain a few tens of KB. */
export const SECRET_BYTES_MAX = 1024 * 1024
const HASH_RE = /^[0-9a-f]{64}$/

const base64 = z.string().refine(isStrictBase64, 'is not base64')
const noNul = (s: string) => !s.includes('\0')
const text = z.string().refine(noNul, 'holds a NUL character')
const seconds = z.number().int().positive().max(WORKFLOW_TIMEOUT_MAX_SECONDS)

const parameter = z.discriminatedUnion('kind', [
  z.object({ name: z.string(), kind: z.literal('pattern'), pattern: z.string() }).strict(),
  z.object({ name: z.string(), kind: z.literal('values'), values: z.array(z.string()).max(WORKFLOW_LIMITS.valuesMax) }).strict(),
  z.object({ name: z.string(), kind: z.literal('text') }).strict(),
])

const definition = z.object({
  name: z.string(),
  description: z.string().max(WORKFLOW_LIMITS.descriptionMax),
  steps: z.array(z.object({
    name: z.string().max(WORKFLOW_LIMITS.stepNameMax).refine(noNul),
    run: z.string().min(1).max(WORKFLOW_LIMITS.runMax).refine(noNul),
    secrets: z.array(z.string()).max(WORKFLOW_LIMITS.secretsPerStepMax),
    timeoutSeconds: seconds.nullable(),
  }).strict()).min(1).max(WORKFLOW_LIMITS.stepsMax),
  variables: z.array(z.string()).max(WORKFLOW_LIMITS.variablesMax),
  parameters: z.array(parameter).max(WORKFLOW_LIMITS.parametersMax),
  hosts: z.array(z.object({ host: z.string().min(1).max(253), port: z.number().int().min(1).max(65535) }).strict()).max(WORKFLOW_LIMITS.hostsMax),
  github: z.record(z.enum(GITHUB_REPOSITORY_PERMISSIONS), z.enum(GITHUB_PERMISSION_LEVELS)),
  timeoutSeconds: seconds,
  files: z.array(z.string()).max(WORKFLOW_LIMITS.filesMax),
}).strict()

const instructionSchema = z.object({
  runId: z.string().refine(isRunId, 'is not a run id'),
  versionHash: z.string().regex(HASH_RE),
  definition,
  files: z.array(z.object({ path: z.string(), contentBase64: base64, executable: z.boolean() }).strict()).max(WORKFLOW_LIMITS.filesMax),
  githubSecretNames: z.array(z.string()),
  executorImageDigest: z.string().regex(EXECUTOR_IMAGE_DIGEST_RE),
  workspace: z.object({
    ownerType: z.enum(WORKSPACE_OWNER_TYPES),
    ownerId: z.string().min(1),
    workspaceId: z.string().min(1).nullable(),
  }).strict(),
  steps: z.array(z.object({ secrets: z.record(z.string(), base64) }).strict()),
  variables: z.record(z.string(), text),
  parameters: z.record(z.string(), z.string()),
  limits: z.object({
    memoryMb: z.number().int().min(64).max(65536),
    processes: z.number().int().min(16).max(65536),
    cpus: z.number().positive().max(256),
  }).strict(),
  masking: z.object({
    key: base64.refine(s => s.length > 0, 'is empty'),
    forms: z.array(z.object({
      length: z.number().int().positive(),
      hmac: z.string().regex(HASH_RE),
      secretName: z.string(),
      class: z.enum(WORKFLOW_MASK_FORM_CLASSES).optional(),
    }).strict()),
  }).strict(),
  github: z.object({ repository: z.string(), repositoryId: z.number().int().positive(), cloneUrl: z.string() }).strict().nullable(),
}).strict()

export type CheckedInstruction = {
  instruction: WorkflowRunInstruction
  files: WorkflowVersionFile[]
}

export type InstructionCheck =
  | { ok: true; checked: CheckedInstruction }
  | { ok: false; reason: Extract<WorkflowRunRefusal, 'invalid_instruction' | 'hash_mismatch'>; message: string }

const NOTHING_CHANGED = 'Nothing was changed.'

function invalid(what: string): InstructionCheck {
  return { ok: false, reason: 'invalid_instruction', message: `The run instruction is not one this site can carry out: ${what} ${NOTHING_CHANGED}` }
}

export async function checkInstruction(raw: unknown): Promise<InstructionCheck> {
  const parsed = instructionSchema.safeParse(raw)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    // The path only: an issue's message can quote what it received, and a received value may be a secret.
    return invalid(`${issue?.path.join('.') || 'the instruction'} is missing or of the wrong kind.`)
  }
  const ins = parsed.data as WorkflowRunInstruction
  const d = ins.definition

  const named = validateWorkflowName(d.name)
  if (!named.ok) return invalid(named.reason!)
  for (const v of d.variables) {
    const r = validateVariableName(v)
    if (!r.ok) return invalid(r.reason!)
  }
  for (const p of d.parameters) {
    const r = validateParameterName(p.name)
    if (!r.ok) return invalid(r.reason!)
  }
  if (ins.steps.length !== d.steps.length) return invalid('it gives values for a different number of steps than the workflow has.')
  for (const [i, step] of d.steps.entries()) {
    for (const s of step.secrets) {
      const r = validateSecretName(s)
      if (!r.ok) return invalid(r.reason!)
    }
    const given = Object.keys(ins.steps[i]!.secrets).sort()
    if (!sameList(given, [...step.secrets].sort())) return invalid(`step ${i + 1}'s secrets are not the ones it names.`)
    for (const name of given) {
      if (Buffer.byteLength(ins.steps[i]!.secrets[name]!, 'base64') > SECRET_BYTES_MAX) return invalid(`${name} is larger than ${SECRET_BYTES_MAX} bytes.`)
    }
  }
  if (!sameList(Object.keys(ins.variables).sort(), [...d.variables].sort())) return invalid('its variables are not the ones the workflow names.')
  const params = checkParameterValues(d, ins.parameters)
  if (!params.ok) return invalid(params.errors.map(e => e.message).join(' '))
  const needsGitHub = d.steps.some(s => s.secrets.includes('GITHUB_TOKEN'))
  if (needsGitHub !== (ins.github !== null)) return invalid('its repository does not match whether a step names GITHUB_TOKEN.')

  const files: WorkflowVersionFile[] = ins.files.map(f => ({ path: f.path, bytes: Buffer.from(f.contentBase64, 'base64'), executable: f.executable }))
  let hash: string
  try {
    hash = await hashWorkflowVersion({ definition: d, files, githubSecretNames: ins.githubSecretNames, executorImageDigest: ins.executorImageDigest })
  } catch (err) {
    return invalid(err instanceof Error ? err.message : 'its version cannot be hashed.')
  }
  if (hash !== ins.versionHash) {
    return {
      ok: false,
      reason: 'hash_mismatch',
      message: `What arrived is not the version that was approved: its hash differs. Nothing was run, and nothing was changed.`,
    }
  }
  return { ok: true, checked: { instruction: ins, files } }
}

function sameList(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((x, i) => x === b[i])
}

function isStrictBase64(s: string): boolean {
  if (s.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(s)) return false
  return Buffer.from(s, 'base64').toString('base64') === s
}
