/**
 * A stored version back as core's `WorkflowVersionContent`, and its hash recomputed: what is approved, and later
 * run, is checked against the hash the person was shown, not only read from the row.
 */
import { hashWorkflowVersion, type WorkflowDefinition, type WorkflowVersionContent } from '@agenthix/core'

export type StoredVersion = {
  definition: unknown
  githubSecretNames: string[]
  executorImageDigest: string
  files: { path: string; content: Uint8Array; executable: boolean }[]
}

export function contentOf(v: StoredVersion): WorkflowVersionContent {
  return {
    definition: v.definition as WorkflowDefinition,
    files: v.files.map((f) => ({ path: f.path, bytes: new Uint8Array(f.content), executable: f.executable })),
    githubSecretNames: v.githubSecretNames,
    executorImageDigest: v.executorImageDigest,
  }
}

/** Whether the stored version still hashes to `hash`; false for content that can't be hashed at all. */
export async function storedVersionMatches(v: StoredVersion, hash: string): Promise<boolean> {
  try {
    return (await hashWorkflowVersion(contentOf(v))) === hash
  } catch {
    return false
  }
}
