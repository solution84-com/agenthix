/** How a site's and its machine's figures turn into the words on its page (board *A site's page*). */
import type { HostCeilings, HostFigures, ProtectionRule } from '@agenthix/core'
import type { PillTone } from '@agenthix/ui/primitives'
import { GB, MEMORY_GB, NEAR_CAPACITY, percent } from '../dashboard/words'

const plural = (n: number, word: string) => `${n} ${n === 1 ? word : word.endsWith('s') ? `${word}es` : `${word}s`}`

/** Gigabytes, one decimal only when there is one: "4", "1.5". */
export const gbOf = (bytes: number): string => String(Math.round((bytes / GB) * 10) / 10)
export const memoryGbOf = (bytes: number): string => String(Math.round((bytes / MEMORY_GB) * 10) / 10)

export function ceilingWords(c: HostCeilings): { each: string; atOnce: string } {
  return {
    each: `${memoryGbOf(c.memoryBytesPerContainer)} GB memory · ${plural(c.cpusPerContainer, 'processor')} · ${plural(c.processesPerContainer, 'process')}`,
    atOnce: String(c.containersAtOnce),
  }
}

export type MeterWords = { percent: number; warn: boolean; text: string; detail: string; say: { lead: string; rest: string } | null }

export function diskWords(d: HostFigures['resources']['disk']): MeterWords {
  const used = percent(d.totalBytes - d.freeBytes, d.totalBytes)
  const warn = used >= NEAR_CAPACITY
  return {
    percent: used, warn, text: `${used}%`,
    detail: `${gbOf(d.totalBytes - d.freeBytes)} of ${gbOf(d.totalBytes)} GB used`,
    say: warn ? { lead: `The disk is ${used}% full, ${Math.round(d.freeBytes / GB)} GB left.`, rest: 'Free space or add disk before it fills, or the site stops taking runs.' } : null,
  }
}

/** The disk branches' working copies use, against the machine's disk; null while the site has not said. */
export function copiesWords(disk: HostFigures['resources']['disk'], copiesBytes: number | null | undefined): string | null {
  if (copiesBytes === null || copiesBytes === undefined) return null
  return `${gbOf(copiesBytes)} GB of ${gbOf(disk.totalBytes)} GB · ${percent(copiesBytes, disk.totalBytes)}% of the disk`
}

export function memoryWords(m: HostFigures['resources']['memory']): MeterWords {
  const used = percent(m.usedBytes, m.totalBytes)
  const warn = used >= NEAR_CAPACITY
  return {
    percent: used, warn, text: `${memoryGbOf(m.usedBytes)} GB`,
    detail: `${memoryGbOf(m.usedBytes)} of ${memoryGbOf(m.totalBytes)} GB memory`,
    say: warn ? { lead: `Memory is ${used}% in use.`, rest: 'Agents may be refused until some finish.' } : null,
  }
}

export function agoWords(iso: string, now: Date): string {
  const s = Math.max(0, Math.floor((now.getTime() - new Date(iso).getTime()) / 1000))
  if (s < 60) return `${plural(s, 'second')} ago`
  if (s < 3600) return `${plural(Math.floor(s / 60), 'minute')} ago`
  if (s < 86400) return `${plural(Math.floor(s / 3600), 'hour')} ago`
  return `${plural(Math.floor(s / 86400), 'day')} ago`
}

const RULE: Record<ProtectionRule, string> = {
  'machine-ports': "the machine's ports",
  'published-ports': "other containers' ports",
  'metadata-address': 'the metadata address',
  'private-addresses': 'private network addresses from live previews',
  'public-address': "the machine's own public address from live previews",
}

const list = (items: string[], and = 'and') => (items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} ${and} ${items[items.length - 1]}`)

/**
 * The protections as a fact (spec §8): what holds, or why not. There is nothing here to set. While they hold the pill
 * says so and nothing says when they were checked; a problem says when.
 */
export function protectionWords(p: HostFigures['protections'], now: Date): { label: string; tone: PillTone; sentence: string } {
  if (p.holding) {
    const what = p.rules.length ? list(p.rules.map(r => RULE[r]), 'or') : 'what they guard'
    return { label: 'In place', tone: 'healthy', sentence: `Agents can't reach ${what}.` }
  }
  const checked = `Checked ${agoWords(p.checkedAt, now)}.`
  const why = p.problem ?? 'The rules that keep agents off the machine do not hold.'
  return { label: 'Not holding', tone: 'danger', sentence: `${why.replace(/\.?$/, '.')} No new agent starts until they hold. ${checked}` }
}

/** The machine's health in two short lines (board *Proposal*, 1): what fills up, and a verdict. */
export function healthWords(f: HostFigures): { verdict: string; tone: PillTone; disk: string; memory: string; say: MeterWords['say'] } {
  const disk = diskWords(f.resources.disk)
  const memory = memoryWords(f.resources.memory)
  const warn = [disk.warn && `Disk ${disk.percent}%`, memory.warn && `Memory ${memory.percent}%`].filter(Boolean)
  return {
    verdict: warn.length ? warn.join(' · ') : 'Fine',
    tone: warn.length ? 'warning' : 'healthy',
    disk: `${disk.percent}% · ${gbOf(f.resources.disk.freeBytes)} GB free`,
    memory: `${memoryGbOf(f.resources.memory.usedBytes)} of ${memoryGbOf(f.resources.memory.totalBytes)} GB`,
    say: disk.say ?? memory.say,
  }
}
