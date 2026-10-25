import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { material } from '../masking/__tests__/material'
import { hashWorkflowVersion, WORKFLOW_CONTAINER_LIMITS, type WorkflowDefinition, type WorkflowRunInstruction } from '@agenthix/core'

/** A canary: a dummy value standing for a secret, which must never come back out. */
export const CANARY = 'canary-7f3a9c1e-deploy-key'
export const CANARY_B = 'canary-b21d44aa-db-password'
export const DIGEST = `sha256:${'a'.repeat(64)}`

export function b64(s: string): string {
  return Buffer.from(s, 'utf8').toString('base64')
}

export function definition(overrides: Partial<WorkflowDefinition> = {}): WorkflowDefinition {
  return {
    name: 'deploy-staging',
    description: 'Build and upload',
    steps: [
      { name: 'Build', run: 'npm run build', secrets: [], timeoutSeconds: null },
      { name: 'Upload', run: './deploy/upload.sh', secrets: ['STAGING_DEPLOY_KEY'], timeoutSeconds: 60 },
      { name: 'Migrate', run: './deploy/upload.sh --migrate', secrets: ['DB_PASSWORD'], timeoutSeconds: null },
    ],
    variables: ['STAGING_HOST'],
    parameters: [{ name: 'ref', kind: 'pattern', pattern: '^[a-z]+$' }],
    hosts: [],
    github: {},
    timeoutSeconds: 600,
    files: ['deploy/upload.sh'],
    ...overrides,
  }
}

export async function instruction(overrides: Partial<WorkflowRunInstruction> = {}): Promise<WorkflowRunInstruction> {
  const d = overrides.definition ?? definition()
  const files = overrides.files ?? [{ path: 'deploy/upload.sh', contentBase64: b64('#!/bin/sh\necho uploading\n'), executable: true }]
  const githubSecretNames = overrides.githubSecretNames ?? []
  const executorImageDigest = overrides.executorImageDigest ?? DIGEST
  const versionHash = overrides.versionHash ?? await hashWorkflowVersion({
    definition: d,
    files: files.map(f => ({ path: f.path, bytes: Buffer.from(f.contentBase64, 'base64'), executable: f.executable })),
    githubSecretNames,
    executorImageDigest,
  })
  return {
    runId: 'run-1',
    versionHash,
    definition: d,
    files,
    githubSecretNames,
    executorImageDigest,
    workspace: { ownerType: 'project', ownerId: 'proj-1', workspaceId: 'ws-1' },
    steps: d.steps.map(s => ({
      secrets: Object.fromEntries(s.secrets.map(n => [n, b64(n === 'DB_PASSWORD' ? CANARY_B : CANARY)])),
    })),
    variables: { STAGING_HOST: 'staging.example.com' },
    parameters: { ref: 'main' },
    limits: WORKFLOW_CONTAINER_LIMITS,
    masking: material({ STAGING_DEPLOY_KEY: CANARY, DB_PASSWORD: CANARY_B }),
    github: null,
    ...overrides,
  }
}

export async function tempDir(prefix: string): Promise<string> {
  return fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), prefix)))
}

/** Writes `tree` (path → content) under `root`. */
export async function writeTree(root: string, tree: Record<string, string>): Promise<void> {
  for (const [p, content] of Object.entries(tree)) {
    await fs.mkdir(path.dirname(path.join(root, p)), { recursive: true })
    await fs.writeFile(path.join(root, p), content)
  }
}
