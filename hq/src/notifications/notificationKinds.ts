/**
 * Which notifications need the person, and which are history (every screen
 * reviewed spec §6). Pure, so the panel, the bell's count and Home's signal
 * share one rule.
 *
 * A notification's status: `unread` until it has been in view in the open
 * panel, then `read`; `handled` once what it asked for was done — the run moved
 * on or someone answered the request; `dismissed` when the person put it away.
 * Seeing an item does not handle it: one that asks for an action stays under
 * Needs you until it is handled.
 */

export const TASK_NOTIFICATION_TYPES = ['tool_approval', 'task_waiting'] as const

/**
 * The persistent kinds Execution Sites raises (spec §3), all to organisation
 * admins (`sites/siteNotifications.ts`).
 */
export const SITE_NOTIFICATION_TYPES = {
  upgrade: 'site_upgrade',
  /** Not connected while a run or a change waits on it. */
  offlineWithWork: 'site_offline_with_work',
  hqSiteDown: 'site_hq_down',
  /** Docker not running, or the machine nearly out of disk or memory; to the people who look after machines. */
  health: 'site_health',
  /** The machine's disk is 80% used, which branches' working copies can fill; to fleet admins, until it is below that. */
  diskFilling: 'site_disk_filling',
} as const

/**
 * The machines in the fleet, to fleet admins (`sites/machineNotices.ts`; host-management spec §6, §10): one that left
 * by itself, until it is removed in the Fleet Console; one not heard from for 10 minutes, until it connects again.
 */
export const FLEET_MACHINE_NOTIFICATION_TYPES = {
  left: 'fleet_machine_left',
  notHeardFrom: 'fleet_machine_not_heard_from',
} as const

/**
 * A run stopped for lack of memory, disk or processes: to the people who look after machines, with what to do, once a
 * day for each site and cause (`sites/resources/runResourceNotice.ts`; host-management spec §10).
 */
export const RUN_SHORT_NOTIFICATION = 'site_run_short'

/**
 * The site a person's projects run on is nearly out of disk or memory: to those members, a sentence with no figure,
 * until it is not (`sites/resources/nearlyOutNotices.ts`; host-management spec §10).
 */
export const SITE_NEARLY_OUT_NOTIFICATION = 'site_nearly_out'

/**
 * The persistent kinds about the workplace, all to organisation admins
 * (`adminNotices.ts`; every screen reviewed spec §3, Needs attention).
 */
export const ORG_NOTIFICATION_TYPES = {
  /** The agents whose approval is Bypassed: a fact, which an admin may acknowledge. */
  bypassed: 'agents_bypassed',
  /** Invitations sent a week ago or more that nobody has accepted. */
  invitations: 'invitations_unanswered',
  /** The built-in agent proposed a team, waiting for an admin to review it. */
  teamProposed: 'team_proposed',
} as const

/**
 * A routine's last three rounds failed in a row: to the routine's person, once
 * per streak, until a round succeeds (`automation/routineFailing.ts`; every
 * screen reviewed spec §3).
 */
export const ROUTINE_FAILING_TYPE = 'routine_failing'

/**
 * The organisation's providers, to organisation admins only (`providers/notices.ts`; models from one place, part 1):
 * `notWorking`, persistent and not dismissible, one per provider until it works again; `changed`, every write to a
 * provider, announced to every organisation admin.
 */
export const PROVIDER_NOTIFICATION_TYPES = {
  notWorking: 'provider_not_working',
  changed: 'provider_changed',
} as const

/**
 * Persistent kinds (`persistent.ts`): each stays under Needs you until what it
 * is about is addressed, or until a person dismisses it where its kind allows.
 * A feature that raises one adds its types here.
 */
/** A secret due for rotation, or overdue (secrets/rotation.ts). */
export const SECRET_ROTATION_NOTIFICATION = 'secret_rotation'

export const PERSISTENT_TYPES: readonly string[] = [
  ...Object.values(SITE_NOTIFICATION_TYPES), ...Object.values(ORG_NOTIFICATION_TYPES), ROUTINE_FAILING_TYPE,
  RUN_SHORT_NOTIFICATION, SITE_NEARLY_OUT_NOTIFICATION, ...Object.values(FLEET_MACHINE_NOTIFICATION_TYPES),
  PROVIDER_NOTIFICATION_TYPES.notWorking, SECRET_ROTATION_NOTIFICATION,
]

/**
 * A conversation's work came back, or asks for approval (conversation layer spec, A completion while a reply
 * streams): to the conversation's reader, with the agent's first line about it, or the result's own line when no
 * reply can run (`conversations/coordinator/notify.ts`). The approval asks the person to act.
 */
export const CONVERSATION_NOTIFICATION_TYPES = {
  result: 'conversation_result',
  approval: 'conversation_approval',
} as const

/** The kinds that ask the person to act: approve, open a waiting task, renew access, and the persistent ones. */
export const NEEDS_ACTION_TYPES: readonly string[] = [
  ...TASK_NOTIFICATION_TYPES, CONVERSATION_NOTIFICATION_TYPES.approval, 'credential_health', ...PERSISTENT_TYPES,
]

/** Statuses of a notification that still waits on its person. */
export const OPEN_STATUSES = ['unread', 'read'] as const

export function needsYou(n: { type: string; status: string }): boolean {
  return NEEDS_ACTION_TYPES.includes(n.type) && (OPEN_STATUSES as readonly string[]).includes(n.status)
}

/** Needs you first, then Earlier; each keeps the order it was given in (newest first). */
export function groupNotifications<T extends { type: string; status: string }>(list: T[]): { needsYou: T[]; earlier: T[] } {
  const out = { needsYou: [] as T[], earlier: [] as T[] }
  for (const n of list) (needsYou(n) ? out.needsYou : out.earlier).push(n)
  return out
}

/** Whether a notification is of a persistent kind: the one place that says so (`PERSISTENT_TYPES`). */
export function isPersistent(n: { type: string }): boolean {
  return PERSISTENT_TYPES.includes(n.type)
}

/**
 * What the bell counts: Needs you items not yet seen, and every persistent one
 * still open, seen or not — opening the panel does not put the bell out while
 * a site is still down. The Needs you heading and Home count the total.
 */
export function countsOnBell(n: { type: string; status: string }): boolean {
  return needsYou(n) && (n.status === 'unread' || isPersistent(n))
}

/**
 * One item per task: a task's first request or waiting notice in the list, which
 * is its latest when the list is newest first. The older ones come back as
 * `superseded`, to be handled. Notifications that are not about a task all stay.
 */
export function latestPerTask<T extends { type: string; actionUrl: string | null }>(list: T[]): { kept: T[]; superseded: T[] } {
  const seen = new Set<string>()
  const out = { kept: [] as T[], superseded: [] as T[] }
  for (const n of list) {
    const key = (TASK_NOTIFICATION_TYPES as readonly string[]).includes(n.type) ? taskKeyOf(n.actionUrl) : null
    if (key && seen.has(key)) out.superseded.push(n)
    else {
      if (key) seen.add(key)
      out.kept.push(n)
    }
  }
  return out
}

/** The task a notification is about, from the link it carries (`/tasks/WEB-27`). */
export function taskKeyOf(actionUrl: string | null | undefined): string | null {
  const m = actionUrl?.match(/^\/tasks\/([A-Z]{2,6}-\d+)$/)
  return m ? m[1] : null
}

export function taskActionUrl(taskKey: string): string {
  return `/tasks/${taskKey}`
}

/** Declared in core's client protocol, since the mobile app reads it too. */
export type { NotificationItem } from '@agenthix/core'
