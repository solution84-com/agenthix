/**
 * A starter's version content, parsed with core's rules and hashed as any proposal is: the same reader the agent's
 * proposals go through, so a starter can't hold what a proposal couldn't.
 */
import {
  checkVersionContent, hashWorkflowVersion, parseWorkflowDefinition, type WorkflowVersionContent,
} from '@agenthix/core'
import type { ProposalContent } from '../proposalContent'
import type { StarterSource } from './definitions'

export async function starterContent(
  source: StarterSource, executorImageDigest: string, githubSecretNames: string[] = [],
): Promise<ProposalContent> {
  const content = starterVersionContent(source, executorImageDigest, githubSecretNames)
  return { content, hash: await hashWorkflowVersion(content), notes: [] }
}

export function starterVersionContent(
  source: StarterSource, executorImageDigest: string, githubSecretNames: string[] = [],
): WorkflowVersionContent {
  const parsed = parseWorkflowDefinition({ ...source.definition, files: source.files.map((f) => f.path) })
  if (!parsed.ok) throw new Error(`The starter ${String(source.definition.name)} doesn't parse: ${JSON.stringify(parsed.errors)}`)
  const byPath = new Map(source.files.map((f) => [f.path, f]))
  const content: WorkflowVersionContent = {
    definition: parsed.definition,
    files: parsed.definition.files.map((path) => {
      const f = byPath.get(path)
      if (!f) throw new Error(`The starter ${parsed.definition.name} names ${path} but doesn't carry it.`)
      return { path, bytes: new TextEncoder().encode(f.text), executable: f.executable }
    }),
    githubSecretNames: [...new Set(githubSecretNames)].sort(),
    executorImageDigest,
  }
  const problems = checkVersionContent(content)
  if (problems.length) throw new Error(`The starter ${parsed.definition.name} can't be a version: ${problems.join(' ')}`)
  return content
}
