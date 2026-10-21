#!/usr/bin/env node
// Starts each built bundle for a few seconds, after `npm run build`, and fails if one dies while loading: a bundle can
// type-check and pass every unit test yet refuse to load in Node, as the S3 client's `require` of Node's own modules
// once did. Docker and the state folder are pointed nowhere, so nothing on the machine is touched.
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const dist = path.resolve(import.meta.dirname, '..', 'dist')
const LOAD_FAILURE = /Dynamic require|is not supported|ERR_MODULE_NOT_FOUND|ERR_REQUIRE|SyntaxError|ReferenceError|Cannot find (module|package)/
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'host-bundles-'))

function start(bundle) {
  return new Promise(resolve => {
    const env = {
      PATH: process.env.PATH, HOME: scratch, HOST_STATE_DIR: path.join(scratch, 'state'),
      HOST_OWNER_SOCKET: path.join(scratch, 'owner.sock'), DOCKER_HOST: `unix://${path.join(scratch, 'no-docker.sock')}`,
    }
    const child = spawn(process.execPath, [path.join(dist, bundle)], { env, stdio: ['ignore', 'pipe', 'pipe'] })
    let output = ''
    child.stdout.on('data', d => { output += d })
    child.stderr.on('data', d => { output += d })
    const timer = setTimeout(() => child.kill('SIGKILL'), 3_000)
    child.on('exit', () => { clearTimeout(timer); resolve(output) })
  })
}

let failed = false
try {
  for (const bundle of ['host.js', 'launcher.js', 'cli.js']) {
    const output = await start(bundle)
    const failure = output.split('\n').find(line => LOAD_FAILURE.test(line))
    if (failure) { failed = true; console.error(`${bundle} does not load in Node: ${failure.trim()}`) }
    else console.log(`${bundle} loads in Node`)
  }
} finally {
  fs.rmSync(scratch, { recursive: true, force: true })
}
process.exit(failed ? 1 : 0)
