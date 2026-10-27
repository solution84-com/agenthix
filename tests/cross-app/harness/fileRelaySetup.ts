// What the tests of a file's path through hq's relay share: the place they open files in, the marker every file holds,
// and a record of every answer hq-server gave them, which must never hold a file's bytes (spec part 6, V5).
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { expect } from 'vitest'
import { hqDb } from './db'
import { HQ_CLIENT_URL, HQ_URL, SITE_ROOT_DIR } from './env'
import { browserGet, waitForRelayLine } from './fileRelay'
import { login, op, until } from './hqApi'
import { ensureDefaultSite } from './knowledgeSetup'

/** In every file the tests put anywhere; it may reach a browser only from the relay. */
export const MARKER = `relaymark${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`

/** Every response body hq-server gave these tests, for V5. */
export const hqAnswers: string[] = []

/** An operation on hq-server, its answer recorded. */
export async function hq(name: string, args: unknown, token: string) {
  const answer = await op(HQ_URL, name, args, token)
  hqAnswers.push(JSON.stringify(answer.raw))
  return answer
}

/** A GET on hq-server, its answer recorded. */
export async function hqGet(path: string, token?: string): Promise<{ status: number; text: string }> {
  const res = await fetch(`${HQ_URL}${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
  const text = Buffer.from(await res.arrayBuffer()).toString('latin1')
  hqAnswers.push(text)
  return { status: res.status, text }
}

export type FileRelayStage = {
  admin: string
  operator: string
  siteId: string
  relayId: string
  project: { id: string }
}

/**
 * hq paired with its own default site, the site holding its line to hq's relay, hq's web page answering, and a
 * project of the admin's that the operator is not in.
 */
export async function stageFileRelay(projectName: string): Promise<FileRelayStage> {
  await ensureDefaultSite()
  const site = await hqDb.executionSite.findFirstOrThrow({ where: { isDefault: true, status: 'ONLINE' } })
  const relay = await waitForRelayLine(site.siteId)
  // `wasp start` brings up the web page beside hq-server; it passes `/t/` and `/relay/` to the relay.
  await until(async () => (await browserGet(`${HQ_CLIENT_URL}/`)).status === 200, "hq's web page", 180_000)
  const admin = await login('e2e-admin', 'E2eAdmin!2026')
  const operator = await login('e2e-operator', 'E2eOperator!2026')
  const made = await op(HQ_URL, 'create-project', { name: `${projectName} ${Date.now().toString(36)}` }, admin)
  expect(made.status, JSON.stringify(made.json)).toBe(200)
  return { admin, operator, siteId: site.siteId, relayId: relay.id, project: { id: made.json.id } }
}

/** Writes a file into a project's storage on the site, as an agent's run would. */
export function putOnSite(projectId: string, folder: 'files' | 'artefacts', path: string, content: string | Buffer): string {
  const full = join(SITE_ROOT_DIR, 'projects', projectId, folder, path)
  mkdirSync(dirname(full), { recursive: true })
  writeFileSync(full, content)
  return full
}
