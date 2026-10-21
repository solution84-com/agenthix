import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, type Page } from '@playwright/test'
import { sample } from './capture'

// One request to hq's control socket, printed as it answers: plain Node, as the host service's own client is.
const ASK = `
import net from 'node:net'
const conn = net.createConnection(process.env.HQ_CONTROL_SOCKET)
let reply = ''
conn.setEncoding('utf8')
conn.on('connect', () => conn.write(JSON.stringify({ command: 'invite-admin', args: [] }) + '\\n'))
conn.on('data', chunk => { reply += chunk })
conn.on('error', () => process.exit(3))
conn.on('end', () => { process.stdout.write(JSON.parse(reply).text ?? '') })
`

/**
 * A new first-admin link, asked of the running hq over its control socket, as `agenthix hq invite-admin` does on an
 * installed machine. Each one replaces the last, so every fresh recipe asks for its own.
 */
export function firstAdminLink(): string {
  const socket = join(tmpdir(), `agenthix-hq-${process.env.E2E_SERVER_PORT ?? '4101'}`, 'control.sock')
  const out = execFileSync('node', ['--input-type=module', '-e', ASK], {
    env: { ...process.env, HQ_CONTROL_SOCKET: socket },
    encoding: 'utf8',
  })
  const link = out.match(/https?:\/\/\S+\/invite\/\S+/)?.[0]
  if (!link) throw new Error(`hq printed no first-admin link:\n${out}`)
  return new URL(link).pathname
}

/** Creates the first administrator, the sample organisation's Sam, from a first-admin link, and lands on setup's next step. */
export async function createFirstAdmin(page: Page): Promise<void> {
  await page.goto(firstAdminLink())
  await fillAccount(page)
  await page.getByRole('button', { name: 'Continue' }).click()
  await expect(page.getByRole('heading', { name: 'Your organisation' })).toBeVisible()
}

export async function fillAccount(page: Page): Promise<void> {
  await page.locator('#name').fill('Sam Okafor')
  await page.locator('#username').fill(sample.people.sam.username)
  await page.locator('#password').fill(sample.password)
}
