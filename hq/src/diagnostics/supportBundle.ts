/**
 * The support bundle (logs and diagnostics spec): one zip an admin attaches
 * when asking someone for help. HQ builds it on request, from HQ and each
 * connected site, and sends it nowhere (adr-0042).
 *
 * **In it:** versions (HQ, each site, the protocol, the agent image); the
 * name of each setting and whether it is set; health; the recent errors of
 * the last 7 days; the logs of HQ and each connected site for the range
 * asked. **Never in it:** what people wrote and agents replied, files, or
 * secrets; and people, projects and agents become `person-1`, `project-2`,
 * `agent-3` in every file (`bundleNames.ts`). Log lines had their secrets
 * removed before they were written; nothing here reads a message, a task's
 * description or a tool call.
 *
 * The same files are returned beside the zip, so **See what is in it** shows
 * exactly what **Download** saves.
 */
import JSZip from 'jszip'
import { BRANDING, SITE_PROTOCOL_VERSION, redactText, type LogLevels } from '@agenthix/core'
import { readHqHealth } from './hqHealth'
import { readSiteHealthCards, type SiteHealthCard } from './siteHealthCards'
import { readRecentErrors } from './recentErrors'
import { HQ_SOURCE, findLogSource, linesAsText, listLogSources, readAllLines } from './logSources'
import { loadBundleNames, type BundleNames } from './bundleNames'

export type BundleLogRange = '24h' | '7d'

export type BundleOptions = { logs: BundleLogRange; levels: LogLevels }

export type SettingState = { name: string; set: boolean }

export type BundleFile = { path: string; text: string }

export type SupportBundle = {
  fileName: string
  createdAt: Date
  /** What it covers, in a sentence: "HQ and 2 sites · Design laptop not connected, so only its last health report". */
  covers: string
  logsSince: Date
  files: BundleFile[]
  sizeBytes: number
  zipBase64: string
}

const RANGE_MS: Record<BundleLogRange, number> = { '24h': 24 * 60 * 60 * 1000, '7d': 7 * 24 * 60 * 60 * 1000 }

function slug(label: string, taken: Set<string>): string {
  const base = label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'site'
  let name = base
  for (let i = 2; taken.has(name); i++) name = `${base}-${i}`
  taken.add(name)
  return name
}

/**
 * A command a site's tool gate quotes when it blocks one (`cmd=npm test (pattern=never)`): a tool call's input,
 * which a bundle never holds. The line keeps what was blocked and why.
 */
const TOOL_COMMAND = /\bcmd=.*?(?= \(| — |$)/gm

export function withoutToolInput(text: string): string {
  return text.replace(TOOL_COMMAND, 'cmd=[left out]')
}

function json(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`
}

function siteVersions(cards: SiteHealthCard[]) {
  return cards.map(c => ({
    site: c.label,
    protocol: c.protocolVersion,
    agentImage: c.health ? { name: c.health.agentImage.name, version: c.health.agentImage.version, present: c.health.agentImage.present } : null,
    docker: c.health?.docker.version ?? null,
  }))
}

function covers(cards: SiteHealthCard[]): string {
  const away = cards.filter(c => !c.connected)
  const head = `HQ and ${cards.length} ${cards.length === 1 ? 'site' : 'sites'}`
  return away.length === 0
    ? head
    : `${head} · ${away.map(c => c.label).join(', ')} not connected, so only ${away.length === 1 ? 'its' : 'their'} last health report`
}

function readme(createdAt: Date, opts: BundleOptions, logsSince: Date, notes: string[]): string {
  return [
    `${BRANDING.displayName} support bundle`,
    `Made ${createdAt.toISOString()}. ${BRANDING.displayName} sent it nowhere: whoever made it chose who gets it.`,
    '',
    'In it:',
    '  versions.json       HQ, each site, the protocol and the agent image',
    '  settings.json       the name of each setting and whether it is set, never its value',
    '  health.json         HQ, and each site\'s last health report',
    '  recent-errors.json  the errors of the last 7 days, grouped by what failed',
    `  logs/               HQ and each connected site since ${logsSince.toISOString()}, ${opts.levels === 'all' ? 'errors, warnings and information' : 'errors and warnings'}`,
    '',
    'Never in it: what people wrote or agents replied, files, keys, tokens, passwords or model logins.',
    'People, projects and agents are named person-1, project-2, agent-3, the same in every file.',
    ...(notes.length ? ['', ...notes] : []),
    '',
  ].join('\n')
}

async function logFiles(names: BundleNames, opts: BundleOptions, since: Date): Promise<{ files: BundleFile[]; notes: string[] }> {
  const files: BundleFile[] = []
  const notes: string[] = []
  const taken = new Set<string>(['hq'])
  for (const source of await listLogSources()) {
    const found = await findLogSource(source.source)
    if (!found) continue
    const read = await readAllLines(found, { levels: opts.levels, since: since.toISOString() })
    if (read.source.notice) {
      notes.push(read.source.notice)
      continue
    }
    const name = source.source === HQ_SOURCE ? 'hq' : slug(source.label, taken)
    files.push({ path: `logs/${name}.log`, text: names.apply(withoutToolInput(linesAsText(read.lines))) })
    if (read.truncated) notes.push(`${source.label}'s log is cut to its newest ${read.lines.length} lines.`)
  }
  return { files, notes }
}

export async function buildSupportBundle(
  readerId: string,
  opts: BundleOptions,
  settings: SettingState[],
  now: Date = new Date(),
): Promise<SupportBundle> {
  const logsSince = new Date(now.getTime() - RANGE_MS[opts.logs])
  const [names, hq, cards, errors] = await Promise.all([
    loadBundleNames(),
    readHqHealth(),
    readSiteHealthCards(now),
    readRecentErrors(readerId, '7d', now),
  ])
  const logs = await logFiles(names, opts, logsSince)

  const recent = errors.groups.map(g => ({
    origin: g.origin,
    title: g.title,
    whatToDo: g.advice,
    count: g.count,
    firstAt: g.firstAt,
    lastAt: g.lastAt,
    ongoing: g.ongoing,
    detail: g.detail,
    site: g.site?.label ?? null,
    agent: g.agent ? names.of(g.agent.id) : null,
    project: g.project ? names.of(g.project.id) : null,
    chatRun: g.chatRun,
  }))

  const files: BundleFile[] = [
    { path: 'README.txt', text: readme(now, opts, logsSince, logs.notes) },
    { path: 'versions.json', text: json({ hq: { version: hq.version, built: hq.built }, protocol: SITE_PROTOCOL_VERSION, sites: siteVersions(cards) }) },
    { path: 'settings.json', text: json(settings) },
    { path: 'health.json', text: json({ hq, sites: cards.map(({ executionSiteId: _id, ...card }) => card) }) },
    { path: 'recent-errors.json', text: json(recent) },
    ...logs.files,
  ].map(f => ({ path: f.path, text: redactText(names.apply(f.text)) }))

  const zip = new JSZip()
  for (const f of files) zip.file(f.path, f.text, { date: now })
  const zipBase64 = await zip.generateAsync({ type: 'base64', compression: 'DEFLATE' })
  const day = now.toISOString().slice(0, 10)
  return {
    fileName: `${BRANDING.cliCommand}-support-${day}.zip`,
    createdAt: now,
    covers: covers(cards),
    logsSince,
    files,
    sizeBytes: Math.floor((zipBase64.length * 3) / 4) - (zipBase64.endsWith('==') ? 2 : zipBase64.endsWith('=') ? 1 : 0),
    zipBase64,
  }
}
