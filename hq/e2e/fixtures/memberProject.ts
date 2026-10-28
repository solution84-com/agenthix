import type { Page } from '@playwright/test'
import { callOperation, sessionToken } from './auth'

/**
 * The key of a project the signed-in person is a member of, so a spec does not depend on which projects an HQ holds
 * (the first one listed may be someone else's, and shows no panel). The first one found is used; an administrator
 * with none creates one, which makes them its member.
 */
export async function memberProjectKey(page: Page): Promise<string> {
  const token = await sessionToken(page)
  const listed = await callOperation(page, 'get-projects', token, undefined)
  if (listed.status() === 200) {
    const { json } = await listed.json() as { json: Array<{ key: string; isMember: boolean; personalSpace?: boolean }> }
    const mine = json.find((p) => p.isMember && !p.personalSpace)
    if (mine) return mine.key
  }
  // A key is 2-6 uppercase letters and unique.
  const key = Array.from({ length: 6 }, () => String.fromCharCode(65 + Math.floor(Math.random() * 26))).join('')
  const made = await callOperation(page, 'create-project', token, { name: `E2E skills ${key}`, key })
  if (made.status() !== 200) throw new Error(`no project to use: creating one answered ${made.status()}: ${await made.text()}`)
  return key
}
