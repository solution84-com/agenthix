/**
 * Each live preview's last *Start with secrets* or *Reload with secrets* run, as its strip shows it (live preview spec
 * section 4, *Secrets*): going, then the names it handed to the app's container, or why it failed. One runs at a time
 * per live preview: a second press while one runs is refused.
 *
 * Held in this process's memory, by live preview: a live preview started again is a new one, whose container holds
 * nothing handed to the one before, so nothing here carries over to it. An HQ restart forgets the record; the
 * container keeps what it was handed.
 */
import { prisma } from 'wasp/server'
import { INTEGRATION_SECRET_NAMES, type WorkflowDefinition } from '@agenthix/core'
import type { LivePreviewSecretsView } from './types'

export type SecretsRunKind = LivePreviewSecretsView['kind']

const last = new Map<string, { runId: string; kind: SecretsRunKind }>()
const asking = new Set<string>()
const GOING = ['WAITING', 'RUNNING'] as const

/** Takes the live preview's one place for a run; false while another is being asked for or is going. */
export async function claimSecretsRun(livePreviewId: string): Promise<boolean> {
  if (asking.has(livePreviewId)) return false
  asking.add(livePreviewId)
  const held = last.get(livePreviewId)
  if (!held) return true
  const run = await prisma.workflowRun.findUnique({ where: { id: held.runId }, select: { state: true } }).catch(() => null)
  if (run && (GOING as readonly string[]).includes(run.state)) {
    asking.delete(livePreviewId)
    return false
  }
  return true
}

/** Lets go of the place, keeping the run it started when there is one. */
export function releaseSecretsRun(livePreviewId: string, started: { runId: string; kind: SecretsRunKind } | null): void {
  if (started) last.set(livePreviewId, started)
  asking.delete(livePreviewId)
}

/** The names a run hands to the app: every step's, without the values minted for the run (as the site hands them). */
export function handedNames(definition: Pick<WorkflowDefinition, 'steps'>): string[] {
  const minted = INTEGRATION_SECRET_NAMES as readonly string[]
  return [...new Set(definition.steps.flatMap(s => s.secrets))].filter(n => !minted.includes(n)).sort()
}

/** The live preview's last secrets run, as its strip shows it; null when none ran in it since HQ started. */
export async function secretsRunOf(livePreviewId: string): Promise<LivePreviewSecretsView | null> {
  const held = last.get(livePreviewId)
  if (!held) return null
  const run = await prisma.workflowRun.findUnique({
    where: { id: held.runId },
    select: { state: true, failureMessage: true, endedAt: true, createdAt: true, version: { select: { definition: true } } },
  })
  if (!run) return null
  const state = run.state === 'PASSED' ? 'passed' : run.state === 'FAILED' ? 'failed' : run.state === 'STOPPED' ? 'stopped' : 'going'
  return {
    runId: held.runId,
    kind: held.kind,
    state,
    names: state === 'passed' ? handedNames(run.version.definition as unknown as WorkflowDefinition) : [],
    message: state === 'failed' || state === 'stopped' ? run.failureMessage : null,
    at: (run.endedAt ?? run.createdAt).toISOString(),
  }
}

/** For tests: forget every record. */
export function forgetSecretsRunsForTests(): void {
  last.clear()
  asking.clear()
}
