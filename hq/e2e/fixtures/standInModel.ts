import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { APIRequestContext } from '@playwright/test'
import { ADMIN, SERVER_URL } from './auth'

// The install test's stand-in for a model provider (scripts/install-test/stand-in-model.mjs), which playwright.config.ts
// starts for the run: an OpenAI-compatible endpoint that streams one fixed reply, so a spec that needs an answer never
// calls a real model. The `stand-in` project points the organisation at it; `stand-in-teardown` puts it back.
export const STAND_IN_PORT = 4182
export const STAND_IN_URL = `http://127.0.0.1:${STAND_IN_PORT}/v1`
export const REPLY = 'The stand-in model answers.'

export const ORG_KEY = { ownerType: 'org', ownerId: 'org', kind: 'API_KEY', provider: 'openai_compatible' }
/** What the setup changed, for the teardown: the talking model before, or nothing when it left an endpoint alone. */
export const RECORD = path.join(os.tmpdir(), `hq-e2e-stand-in-${STAND_IN_PORT}.json`)

export async function adminOperations(request: APIRequestContext) {
  const login = await request.post(`${SERVER_URL}/auth/username/login`, { data: ADMIN, failOnStatusCode: false })
  if (!login.ok()) return null
  const { sessionId } = await login.json() as { sessionId: string }
  return async (name: string, args: unknown) => {
    const res = await request.post(`${SERVER_URL}/operations/${name}`, {
      headers: { Authorization: `Bearer ${sessionId}`, 'Content-Type': 'application/json' },
      data: { json: args },
      failOnStatusCode: false,
    })
    if (!res.ok()) throw new Error(`${name}: ${res.status()} ${await res.text()}`)
    return (await res.json()).json
  }
}

export const writeRecord = (record: { talking: string | null }) => fs.writeFileSync(RECORD, JSON.stringify(record))
export function takeRecord(): { talking: string | null } | null {
  if (!fs.existsSync(RECORD)) return null
  const record = JSON.parse(fs.readFileSync(RECORD, 'utf8'))
  fs.rmSync(RECORD)
  return record
}
