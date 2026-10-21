/**
 * People, projects and agents named `person-1`, `project-2`, `agent-3` in a
 * support bundle, the same throughout every file in it (logs and diagnostics
 * spec, Support bundle).
 *
 * Every way each is written down is replaced: its id, and its names — a
 * person's login and display name, a project's name, key and address name,
 * an agent's name and handle. Numbers follow a fixed order, not the order
 * they happen to appear in, so one bundle's numbering does not depend on
 * which line came first. Over-replacing is the accepted failure: a project
 * called "Website" also renames the word where it is not the project.
 */
import { prisma } from 'wasp/server'

type Entry = { text: string; placeholder: string }

const MIN_NAME = 3

function escape(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export class BundleNames {
  private readonly pattern: RegExp | null
  private readonly byText: Map<string, string>

  constructor(entries: Entry[]) {
    const usable = entries.filter(e => e.text.trim().length >= MIN_NAME)
    this.byText = new Map(usable.map(e => [e.text, e.placeholder]))
    const texts = [...this.byText.keys()].sort((a, b) => b.length - a.length)
    // Not inside a longer word or id: "Kernel" is renamed, "Kernelized" and "web-app" are not; a task key's
    // project part is ("WEB-41").
    this.pattern = texts.length ? new RegExp(`(?<![\\w-])(?:${texts.map(escape).join('|')})(?!\\w|-[A-Za-z])`, 'g') : null
  }

  apply(text: string): string {
    return this.pattern ? text.replace(this.pattern, m => this.byText.get(m) ?? m) : text
  }

  /** The placeholder for an id, when it has one. */
  of(id: string | null | undefined): string | null {
    return id ? this.byText.get(id) ?? null : null
  }
}

export async function loadBundleNames(): Promise<BundleNames> {
  const [people, projects, agents] = await Promise.all([
    prisma.user.findMany({
      select: { id: true, displayName: true, auth: { select: { identities: { select: { providerUserId: true } } } } },
      orderBy: { id: 'asc' },
    }),
    prisma.project.findMany({ select: { id: true, name: true, key: true, slug: true }, orderBy: { id: 'asc' } }),
    prisma.agent.findMany({ select: { id: true, name: true, handle: true }, orderBy: { createdAt: 'asc' } }),
  ])
  const entries: Entry[] = []
  people.forEach((p, i) => {
    const placeholder = `person-${i + 1}`
    for (const text of [p.id, p.displayName, ...(p.auth?.identities.map(x => x.providerUserId) ?? [])]) {
      if (text) entries.push({ text, placeholder })
    }
  })
  projects.forEach((p, i) => {
    const placeholder = `project-${i + 1}`
    for (const text of [p.id, p.name, p.key, p.slug]) if (text) entries.push({ text, placeholder })
  })
  agents.forEach((a, i) => {
    const placeholder = `agent-${i + 1}`
    for (const text of [a.id, a.name, a.handle, `@${a.handle}`]) entries.push({ text, placeholder })
  })
  return new BundleNames(entries)
}
