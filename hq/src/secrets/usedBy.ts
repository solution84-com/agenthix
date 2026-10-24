/**
 * *Used by* (spec part 3): the workflows whose approved version names a secret or a variable. A secret is named by a
 * step's `secrets`, or by the names `set-github-secrets` was approved for; a variable by the definition's
 * `variables`. Read from the stored definition defensively: a shape it does not know names nothing.
 */
import { secretsDb, type ApprovedVersion } from './db'
import type { Place } from './place'
import { refuse } from './refusal'

import type { UsingWorkflowView, ValueKind } from './views'

export type UsingWorkflow = UsingWorkflowView
export type { ValueKind }

const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])

export function namesIn(version: Pick<ApprovedVersion, 'definition' | 'githubSecretNames'>, kind: ValueKind): Set<string> {
  const def = (version.definition ?? {}) as { steps?: unknown; variables?: unknown }
  if (kind === 'variable') return new Set(strings(def.variables))
  const steps = Array.isArray(def.steps) ? def.steps : []
  return new Set([
    ...steps.flatMap(s => strings((s as { secrets?: unknown } | null)?.secrets)),
    ...strings(version.githubSecretNames),
  ])
}

/** For each name, the workflows that use it, by name. */
export function usedByMap(versions: ApprovedVersion[], kind: ValueKind): Map<string, UsingWorkflow[]> {
  const out = new Map<string, UsingWorkflow[]>()
  for (const v of versions) {
    for (const name of namesIn(v, kind)) {
      const list = out.get(name) ?? []
      if (!list.some(w => w.id === v.workflowId)) list.push({ id: v.workflowId, name: v.workflowName, enabled: v.enabled })
      out.set(name, list)
    }
  }
  for (const list of out.values()) list.sort((a, b) => a.name.localeCompare(b.name))
  return out
}

/** The workflows of the place whose approved version uses this secret or variable. */
export async function workflowsUsing(place: Place, kind: ValueKind, name: string): Promise<UsingWorkflow[]> {
  return usedByMap(await secretsDb().approvedVersions(place), kind).get(name) ?? []
}

/**
 * Deleting one a switched-on workflow's approved version names is refused, naming those workflows, so the person can
 * turn them off first (spec part 3, *Deleting and replacing*).
 */
export async function refuseDeleteWhileUsed(place: Place, kind: ValueKind, name: string): Promise<void> {
  const on = (await workflowsUsing(place, kind, name)).filter(w => w.enabled)
  if (on.length === 0) return
  const names = on.map(w => w.name)
  refuse('in_use', `${name} is used by ${names.join(', ')}, which ${on.length === 1 ? 'is' : 'are'} on: turn off what uses it first, then delete it.`, names)
}
