/**
 * A join — the one-time code, the machine that answered it, the fleet admin's confirmation — in the words of the
 * board *Add a site* (spec §6 *Connecting a machine*). Only what the Fleet Console shows of it reaches the screen; the
 * code itself is shown once, from the answer that made it, and never read back.
 */
import { BRANDING } from '@agenthix/core'

/** What `GET /api/joins/:joinId` answers (console/src/join/view.ts). */
export type JoinView = {
  joinId: string
  state: 'waiting' | 'confirming' | 'accepting' | 'installing' | 'restoring' | 'done' | 'failed'
  expiresAt: string
  machine: { name: string; fingerprint: string; fingerprintShort: string } | null
  replaces: { siteName: string; machineName: string; warning: string } | null
  hqClaim: { text: string; marks: boolean } | null
  siteName: string | null
  /** A code for restoring a lost site (adr-0119): the site, its lost machine, and the backup the new machine restores. */
  restore?: { siteName: string; lostMachine: string | null; lastHeardAt: string | null; backupTakenAt: string | null } | null
  problem: string | null
}

/** What `POST /api/joins` answers: the view, and the code, this once. */
export type OpenedJoin = JoinView & { code: string }

export type StepState = 'done' | 'current' | 'todo' | 'failed'
export type JoinStep = { label: string; state: StepState }

export type JoinPhase =
  | { phase: 'waiting'; left: string }
  | { phase: 'arrived'; machine: NonNullable<JoinView['machine']>; warnings: string[] }
  | { phase: 'working'; steps: JoinStep[] }
  | { phase: 'done'; siteName: string; steps: JoinStep[]; note: string | null }
  | { phase: 'failed'; problem: string; steps: JoinStep[]; canRetry: boolean }
  | { phase: 'expired' }
  | { phase: 'refused' }

const STEPS = ['Machine confirmed, identities pinned', 'The site installed and started on it', 'Registered with HQ, by the Fleet Console']

const steps = (done: number, failedAt: number | null = null): JoinStep[] =>
  STEPS.map((label, i) => ({ label, state: i < done ? 'done' : i === failedAt ? 'failed' : i === done && failedAt === null ? 'current' : 'todo' }))

/**
 * `view` null: the Fleet Console no longer knows the code — it ran out, or was withdrawn. `refused`: this screen
 * refused the machine, and the code is spent.
 */
export function joinPhase(view: JoinView | null, now: Date, refused = false): JoinPhase {
  if (refused) return { phase: 'refused' }
  if (!view) return { phase: 'expired' }
  const open = view.state === 'waiting' || view.state === 'confirming'
  if (open && Date.parse(view.expiresAt) <= now.getTime()) return { phase: 'expired' }
  switch (view.state) {
    case 'waiting':
      return { phase: 'waiting', left: timeLeft(view.expiresAt, now) }
    case 'confirming':
      if (!view.machine) return { phase: 'waiting', left: timeLeft(view.expiresAt, now) }
      return { phase: 'arrived', machine: view.machine, warnings: [view.replaces?.warning, view.hqClaim?.text].filter((w): w is string => !!w) }
    case 'accepting':
      return { phase: 'working', steps: steps(0) }
    case 'installing':
    case 'restoring':
      return { phase: 'working', steps: steps(1) }
    case 'done':
      return { phase: 'done', siteName: view.siteName ?? view.machine?.name ?? 'The site', steps: steps(STEPS.length), note: view.problem }
    case 'failed': {
      // A site name is given only once the machine was accepted: then confirming again installs the site again.
      const accepted = view.siteName !== null
      return {
        phase: 'failed', problem: view.problem ?? 'The site could not be added.',
        steps: accepted ? steps(1, 1) : steps(0, 0), canRetry: accepted,
      }
    }
  }
}

/** "14:12 left". */
export function timeLeft(expiresAt: string, now: Date): string {
  const s = Math.max(0, Math.floor((Date.parse(expiresAt) - now.getTime()) / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')} left`
}

/** How long the code works, said once, when it is given. */
export function codeLifetime(expiresAt: string, givenAt: Date): string {
  const minutes = Math.max(1, Math.round((Date.parse(expiresAt) - givenAt.getTime()) / 60_000))
  return `Works once, for the next ${minutes === 1 ? 'minute' : `${minutes} minutes`}.`
}

/** What the machine admin runs on the new machine. Without HQ's address, it says where the address goes. */
export function connectCommand(hqAddress: string | null, code: string): string {
  return `${BRANDING.cliCommand} console connect ${hqAddress ?? '<hq address>'} ${code}`
}
