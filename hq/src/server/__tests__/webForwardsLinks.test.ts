// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { HQ_CONSOLE_LINK_PATH, HQ_HOST_LINK_PATH } from '@agenthix/core'

/**
 * hq-web answers every path it does not forward with the browser app, a 200, so a WebSocket line it forgets to send
 * on to hq-server fails as "not taken" with nothing in hq's log. Every line a machine dials at hq's address is in
 * the Caddyfile's server paths.
 */
const CADDYFILE = readFileSync(path.join(__dirname, '../../../docker/Caddyfile'), 'utf8')
const serverPaths = (CADDYFILE.match(/^\s*@server path (.+)$/m)?.[1] ?? '').split(/\s+/)

describe('hq-web forwards the lines machines dial to hq-server', () => {
  it.each([HQ_HOST_LINK_PATH, HQ_CONSOLE_LINK_PATH])('%s', (linkPath) => {
    expect(serverPaths).toContain(linkPath)
  })
})
