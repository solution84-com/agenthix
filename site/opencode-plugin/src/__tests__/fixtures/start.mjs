// Starts `opencode serve` on the container's loopback with the environment in
// /f/server-env.json, detached, as the image's user; its log goes to /f/logs.
import { spawn } from 'node:child_process'
import fs from 'node:fs'

const env = JSON.parse(fs.readFileSync('/f/server-env.json', 'utf8'))
const out = fs.openSync(`/f/logs/opencode-${process.argv[2] ?? 'server'}.log`, 'a')
const child = spawn('opencode', ['serve', '--port', '4096', '--hostname', '127.0.0.1', '--print-logs', '--log-level', 'INFO'], {
  cwd: '/projects/p1/files', env: { PATH: process.env.PATH, HOME: '/home/appuser', ...env }, detached: true, stdio: ['ignore', out, out],
})
child.unref()
