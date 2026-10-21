/**
 * A run that stopped for lack of resources, and a machine that is nearly out of them (host-management
 * spec §10).
 *
 * The site works out why a run failed — its container ran out of memory, the disk filled, or it reached the most
 * processes a run may start — and sends the cause with the limit it hit on the run's status frame and on the
 * transcript's failed row. The causes are a closed set, so hq never shows a raw code; hq writes the words, because
 * only hq knows the name people know the site by.
 *
 * The sentences a person reads are here, so the run, the task and the conversation say the same thing. A member
 * reads the limit a run gets (a ceiling, the same on every page that names it), never the machine's own figures.
 */

export const RUN_RESOURCE_CAUSES = ['memory', 'disk', 'processes'] as const

export type RunResourceCause = (typeof RUN_RESOURCE_CAUSES)[number]

export type RunResourceShortage = {
  cause: RunResourceCause
  /** What each run gets: memory in bytes, or how many processes. Null for the disk, and when the site did not know. */
  limit: number | null
}

/** Who has been told, in the words every one of these sentences ends with. */
export const FLEET_ADMINS_TOLD = 'Your fleet admins have been told.'

function positiveInteger(v: unknown): number | null {
  return typeof v === 'number' && Number.isInteger(v) && v > 0 ? v : null
}

/** A shortage as it came off the wire, checked; null when it is not one. */
export function parseRunResourceShortage(data: unknown): RunResourceShortage | null {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null
  const d = data as { cause?: unknown; limit?: unknown }
  if (!(RUN_RESOURCE_CAUSES as readonly unknown[]).includes(d.cause)) return null
  const cause = d.cause as RunResourceCause
  return { cause, limit: cause === 'disk' ? null : positiveInteger(d.limit) }
}

const GIB = 1024 ** 3

/** Memory in the machine's binary units, as the ceilings are written everywhere: "4 GB", "1.5 GB", "512 MB". */
export function memoryAmountText(bytes: number): string {
  if (bytes >= GIB) return `${Math.round((bytes / GIB) * 10) / 10} GB`
  return `${Math.round(bytes / 1024 ** 2)} MB`
}

/**
 * The sentence on the run, the task and the conversation: "This run stopped: it ran out of memory (each run on
 * office-server gets 4 GB). Your fleet admins have been told."
 */
export function runResourceSentence(shortage: RunResourceShortage, siteName: string): string {
  switch (shortage.cause) {
    case 'memory':
      return shortage.limit
        ? `This run stopped: it ran out of memory (each run on ${siteName} gets ${memoryAmountText(shortage.limit)}). ${FLEET_ADMINS_TOLD}`
        : `This run stopped: it ran out of the memory each run on ${siteName} gets. ${FLEET_ADMINS_TOLD}`
    case 'processes':
      return shortage.limit
        ? `This run stopped: it started more processes than a run may (each run on ${siteName} may start ${shortage.limit}). ${FLEET_ADMINS_TOLD}`
        : `This run stopped: it started more processes than a run on ${siteName} may. ${FLEET_ADMINS_TOLD}`
    case 'disk':
      return `This run stopped: the disk on ${siteName} is full. ${FLEET_ADMINS_TOLD}`
  }
}

/** What a machine can be nearly out of, as hq tells the members whose work runs there. */
export type MachineShortage = 'disk' | 'memory'

/** "office-server is nearly out of disk; runs may fail. Your fleet admins have been told." — never a figure. */
export function nearlyOutText(siteName: string, shortage: MachineShortage | MachineShortage[]): string {
  const what = Array.isArray(shortage) ? shortage.join(' and ') : shortage
  return `${siteName} is nearly out of ${what}; runs may fail. ${FLEET_ADMINS_TOLD}`
}

/** "Runs are waiting: office-server is at capacity" — where runs wait for the site's containers-at-once ceiling. */
export function atCapacityText(siteName: string | null): string {
  return `Runs are waiting: ${siteName ?? 'its site'} is at capacity`
}
