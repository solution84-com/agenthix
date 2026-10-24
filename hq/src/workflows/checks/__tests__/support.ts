import { parseWorkflowDefinition, type WorkflowCheckFlag, type WorkflowVersionContent } from '@agenthix/core'
import { checkFlags } from '..'

export const DIGEST = `sha256:${'1'.repeat(64)}`

type Files = Record<string, string | { text: string; executable: boolean }>

/** A version from a definition as YAML would leave it, and its files' text. */
export function version(raw: Record<string, unknown>, files: Files = {}, digest = DIGEST): WorkflowVersionContent {
  const parsed = parseWorkflowDefinition({ name: 'test-flow', ...raw })
  if (!parsed.ok) throw new Error(JSON.stringify(parsed.errors))
  return {
    definition: parsed.definition,
    files: Object.entries(files).sort(([a], [b]) => (a < b ? -1 : 1)).map(([path, f]) => ({
      path,
      bytes: new TextEncoder().encode(typeof f === 'string' ? f : f.text),
      executable: typeof f === 'string' ? path.endsWith('.sh') : f.executable,
    })),
    githubSecretNames: [],
    executorImageDigest: digest,
  }
}

export const step = (run: string, secrets?: string[], name = 'Step') => ({ name, run, ...(secrets ? { secrets } : {}) })

export function flagsOf(rule: number, v: WorkflowVersionContent, approved: WorkflowVersionContent | null = null): WorkflowCheckFlag[] {
  return checkFlags(v, approved, { known: false }).filter((f) => f.rule === rule)
}
