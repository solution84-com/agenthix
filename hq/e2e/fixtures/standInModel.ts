import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { APIRequestContext } from '@playwright/test'
import { ADMIN, SERVER_URL } from './auth'

// The install test's stand-in for a model provider (scripts/install-test/stand-in-model.mjs), which playwright.config.ts
// starts for the run: an OpenAI-compatible endpoint that streams one fixed reply, so a spec that needs an answer never
// calls a real model. The `stand-in` project adds it to the organisation's providers as an OpenAI-compatible endpoint
// (its check lists /models, which the stand-in answers, so no vendor is reached) and makes it the default conversation
// and worker model; `stand-in-teardown` removes it and puts the defaults back.
export const STAND_IN_PORT = 4182
export const STAND_IN_URL = `http://127.0.0.1:${STAND_IN_PORT}/v1`
export const REPLY = 'The stand-in model answers.'

export const STAND_IN_MODEL = 'stand-in'
/** A made-up key: the stand-in accepts any. */
export const STAND_IN_KEY = 'sk-test-fake'
/** What the setup changed, for the teardown: the provider it added and the defaults before; no record when it left an endpoint alone. */
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

export type StandInRecord = { providerId: string; conversation: string | null; worker: string | null }
export const writeRecord = (record: StandInRecord) => fs.writeFileSync(RECORD, JSON.stringify(record))
export function takeRecord(): StandInRecord | null {
  if (!fs.existsSync(RECORD)) return null
  const record = JSON.parse(fs.readFileSync(RECORD, 'utf8'))
  fs.rmSync(RECORD)
  return record
}
