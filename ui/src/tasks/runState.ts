/**
 * The one label table for a task's run state (agents own schedule spec §6).
 * Every place that shows a run state reads it from here, so no raw value
 * (`RUN_ACTIVE`, …) ever reaches the screen. `RUN_NONE` — no run pending — has
 * no label and shows nothing.
 */

import { atCapacityText } from '@agenthix/core'

export const RUN_STATES = ['RUN_NONE', 'RUN_QUEUED', 'RUN_THROTTLED', 'RUN_ACTIVE', 'RUN_BLOCKED', 'RUN_FAILED'] as const

export type RunState = (typeof RUN_STATES)[number]

/** The run states a person can filter or count by — every one but RUN_NONE. */
export const SHOWN_RUN_STATES = ['RUN_QUEUED', 'RUN_THROTTLED', 'RUN_ACTIVE', 'RUN_BLOCKED', 'RUN_FAILED'] as const

const LABELS: Record<(typeof SHOWN_RUN_STATES)[number], string> = {
  RUN_QUEUED: 'Queued',
  RUN_THROTTLED: 'Throttled',
  RUN_ACTIVE: 'Running',
  RUN_BLOCKED: 'Needs you',
  RUN_FAILED: 'Run failed',
}

const CLASSES: Record<(typeof SHOWN_RUN_STATES)[number], string> = {
  RUN_QUEUED: 'bg-surface-3 text-text-secondary',
  RUN_THROTTLED: 'bg-surface-3 text-text-muted',
  RUN_ACTIVE: 'bg-accent/20 text-accent',
  RUN_BLOCKED: 'bg-warning/20 text-warning',
  RUN_FAILED: 'bg-danger/20 text-danger',
}

function shown(state: string | null | undefined): state is (typeof SHOWN_RUN_STATES)[number] {
  return state != null && Object.prototype.hasOwnProperty.call(LABELS, state)
}

/** The label people see, or null when there is nothing to show (no run pending, or a value this table does not know). */
export function runStateLabel(state: string | null | undefined): string | null {
  return shown(state) ? LABELS[state] : null
}

/** Token classes for a run state's badge; empty when nothing is shown. */
export function runStateClasses(state: string | null | undefined): string {
  return shown(state) ? CLASSES[state] : ''
}

/** A run is queued, throttled until the next round, or going. */
export function isRunPending(state: string | null | undefined): boolean {
  return state === 'RUN_QUEUED' || state === 'RUN_THROTTLED' || state === 'RUN_ACTIVE'
}

/** A person must look: the last run failed, or it stopped for them (a tool request, a limit, lost access). */
export function runNeedsPerson(state: string | null | undefined): boolean {
  return state === 'RUN_BLOCKED' || state === 'RUN_FAILED'
}

/**
 * Why a queued or throttled task has not started, as hq works it out when the
 * task is read (agents own schedule spec §6) — or why a running one is held.
 */
export type RunWaitNote =
  | { kind: 'line'; position: number; agentName: string; agentBusy: boolean }
  | { kind: 'round'; roundOpen: boolean; nextAt: string | null }
  | { kind: 'automationOff' }
  /** Its site is at its containers-at-once ceiling. */
  | { kind: 'slot'; siteName?: string | null }
  | { kind: 'noAgent' }

function ordinal(n: number): string {
  const rem100 = n % 100
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`
  return `${n}${({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th'}`
}

function clock(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

/** The words for a wait note: "2nd in line for AgentX", "Next round at 14:05", … Null when there is none. */
export function runWaitText(note: RunWaitNote | null | undefined): string | null {
  if (!note) return null
  switch (note.kind) {
    case 'line':
      return note.position === 1 && !note.agentBusy
        ? `Starting for ${note.agentName}`
        : `${ordinal(note.position)} in line for ${note.agentName}`
    case 'round':
      if (note.roundOpen) return 'Waits for the next round, after the current one'
      return note.nextAt ? `Next round at ${clock(note.nextAt)}` : 'Waits for the next round'
    case 'automationOff':
      return "Automation is off — it waits for a person"
    case 'slot':
      return atCapacityText(note.siteName ?? null)
    case 'noAgent':
      return 'No agent assigned — nothing can run this until one is'
  }
}
