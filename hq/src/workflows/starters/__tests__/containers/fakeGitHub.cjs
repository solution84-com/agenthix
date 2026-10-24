// A stand-in for github.com's git over HTTPS, for the starters' container tests: git's smart HTTP protocol served
// from bare repositories under /srv/git, with `git upload-pack` and `git receive-pack`. It answers only a request
// whose Basic credentials hash to /fake/expected-auth (so a push or fetch that arrives proves the run's token was
// used), and it never writes the credentials anywhere.
const { createHash } = require('node:crypto')
const { spawn } = require('node:child_process')
const fs = require('node:fs')
const https = require('node:https')
const zlib = require('node:zlib')

const expected = fs.readFileSync('/fake/expected-auth', 'utf8').trim()
const env = { PATH: '/usr/bin:/bin', HOME: '/tmp', GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'safe.directory', GIT_CONFIG_VALUE_0: '*' }
const pkt = (s) => (s.length + 4).toString(16).padStart(4, '0') + s

https.createServer({ key: fs.readFileSync('/fake/server.key'), cert: fs.readFileSync('/fake/server.crt') }, (req, res) => {
  const url = new URL(req.url, 'https://github.com')
  const m = /^\/([\w.-]+\/[\w.-]+?)(?:\.git)?\/(info\/refs|git-upload-pack|git-receive-pack)$/.exec(url.pathname)
  const auth = req.headers.authorization ?? ''
  if (createHash('sha256').update(auth).digest('hex') !== expected) {
    res.writeHead(401, { 'WWW-Authenticate': 'Basic realm="GitHub"' })
    return res.end()
  }
  if (!m) { res.writeHead(404); return res.end() }
  const repo = `/srv/git/${m[1]}.git`
  const service = m[2] === 'info/refs' ? url.searchParams.get('service') : m[2]
  if (service !== 'git-upload-pack' && service !== 'git-receive-pack') { res.writeHead(403); return res.end() }
  const verb = service.slice(4)
  if (m[2] === 'info/refs') {
    res.writeHead(200, { 'Content-Type': `application/x-${service}-advertisement`, 'Cache-Control': 'no-cache' })
    res.write(pkt(`# service=${service}\n`) + '0000')
    const p = spawn('git', [verb, '--stateless-rpc', '--advertise-refs', repo], { env })
    p.stdout.pipe(res)
    return
  }
  res.writeHead(200, { 'Content-Type': `application/x-${service}-result`, 'Cache-Control': 'no-cache' })
  const p = spawn('git', [verb, '--stateless-rpc', repo], { env })
  const body = req.headers['content-encoding'] === 'gzip' ? req.pipe(zlib.createGunzip()) : req
  body.pipe(p.stdin)
  p.stdout.pipe(res)
}).listen(443, '127.0.0.1', () => fs.writeFileSync('/tmp/fake-github-ready', ''))
