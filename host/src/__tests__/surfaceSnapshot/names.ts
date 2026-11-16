/**
 * The names an installation creates on its machine, which a later release must find again: every name `namesFor`
 * derives from the recorded namespace, and the container parts and label keys the host service passes it.
 */
import fs from 'node:fs'
import path from 'node:path'
import type { InstallNamespace } from '@agenthix/core'
import { namesFor } from '../../state/namespace'

const HOST_SRC = path.resolve(import.meta.dirname, '../..')
const NS = '<namespace>' as InstallNamespace

function sources(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) return e.name === '__tests__' ? [] : sources(p)
    return e.name.endsWith('.ts') && !e.name.endsWith('.test.ts') ? [p] : []
  })
}

export function namesEntries(): string[] {
  const names = namesFor(NS)
  const entries = Object.entries(names).filter(([, v]) => typeof v === 'string').map(([key, value]) => `${key}: ${value}`)
  const texts = sources(HOST_SRC).map(f => fs.readFileSync(f, 'utf8'))
  for (const text of texts) {
    for (const m of text.matchAll(/\.container\('([a-z][a-z0-9-]*)'\)/g)) entries.push(`container: ${names.container(m[1])}`)
    for (const m of text.matchAll(/\.label\('([a-z][a-z0-9-]*)'\)/g)) entries.push(`label: ${names.label(m[1])}`)
  }
  return [...new Set(entries)].sort()
}
