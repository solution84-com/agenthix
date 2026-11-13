#!/usr/bin/env node
// Runs hq from its compiled output, as `wasp start` runs it but without watching or compiling: the server's bundle
// (`.wasp/out/server/bundle/server.js`, in development mode) and the web page's dev server (Vite, on hq's own
// vite.config.ts). `wasp start` regenerates `.wasp/out` and reinstalls on every start, so two of them in one checkout
// restart each other; this lets several hq run side by side, each on its own ports and database, from one build.
//
//   node scripts/regression/hq-built.mjs --build    compile hq and bundle its server, once, before any run
//   node scripts/regression/hq-built.mjs            run it: PORT, HQ_WEB_PORT, HQ_SERVER_PORT, DATABASE_URL and the
//                                                   rest from the environment (start it under with-test-db.mjs)
//
// Each run's Vite keeps its optimised dependencies in a folder of its own, `hq/node_modules/.vite-<run>`, started as a
// copy of the checkout's `.vite` and removed when it stops, so one run's optimiser never reloads another's pages. It
// sits beside `.vite` because Vite records the dependencies' paths relative to that folder.
import { spawn, spawnSync } from 'node:child_process'
import { cpSync, existsSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HQ = resolve(dirname(fileURLToPath(import.meta.url)), '../../hq')
const SERVER = join(HQ, '.wasp/out/server')

function run(command, args, cwd) {
  const r = spawnSync(command, args, { cwd, stdio: 'inherit', env: process.env })
  if (r.status !== 0) {
    console.error(`[hq-built] ${command} ${args.join(' ')} failed in ${cwd} (exit ${r.status})`)
    process.exit(r.status ?? 1)
  }
}

export function build() {
  run('npx', ['wasp', 'compile'], HQ)
  run('npm', ['run', 'bundle'], SERVER)
}

function alive(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch (err) {
    return err.code === 'EPERM'
  }
}

async function startVite() {
  const pkg = JSON.parse(readFileSync(join(HQ, 'node_modules/vite/package.json'), 'utf8'))
  const entry = typeof pkg.exports['.'] === 'string' ? pkg.exports['.'] : pkg.exports['.'].import
  const { createServer } = await import(pathToFileURL(join(HQ, 'node_modules/vite', entry)).href)
  // Named for this process: a folder whose process is gone (one killed outright) is removed by the next run.
  for (const name of readdirSync(join(HQ, 'node_modules'))) {
    const pid = Number(/^\.vite-run-(\d+)$/.exec(name)?.[1])
    if (pid && !alive(pid)) rmSync(join(HQ, 'node_modules', name), { recursive: true, force: true })
  }
  const cacheDir = join(HQ, 'node_modules', `.vite-run-${process.pid}`)
  const shared = join(HQ, 'node_modules/.vite')
  if (existsSync(shared)) cpSync(shared, cacheDir, { recursive: true })
  const server = await createServer({
    root: HQ,
    configFile: join(HQ, 'vite.config.ts'),
    cacheDir,
    server: { open: false },
  })
  await server.listen()
  server.printUrls()
  await warm(server)
  return { server, cacheDir }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/**
 * Transforms every page's source before a browser asks for one. A dependency Vite first meets on a page is optimised
 * then and the open pages reloaded, which a browser test sees as a page that vanished mid-step (`wasp start` beside a
 * developer has long since met them all). Done here, the reload happens with no page open. Prints a line when done:
 * a caller waits for it (stack.mjs).
 */
async function warm(server) {
  const started = Date.now()
  const files = readdirSync(join(HQ, 'src'), { recursive: true })
    .filter((f) => f.endsWith('.tsx') && !/(__tests__|\.test\.tsx$)/.test(f))
  await Promise.all(files.map((f) => server.warmupRequest(`/src/${f}`).catch(() => {})))
  await server.waitForRequestsIdle().catch(() => {})
  const optimizer = server.environments?.client?.depsOptimizer
  const end = Date.now() + 120_000
  let quiet = 0
  while (optimizer && Date.now() < end && quiet < 3) {
    quiet = Object.keys(optimizer.metadata.discovered ?? {}).length === 0 ? quiet + 1 : 0
    await sleep(1000)
  }
  console.log(`[hq-built] the web page is warm: ${files.length} files in ${Math.round((Date.now() - started) / 1000)} s`)
}

async function main() {
  if (!existsSync(join(SERVER, 'bundle/server.js'))) {
    console.error('[hq-built] hq has no server bundle: run `node scripts/regression/hq-built.mjs --build` first')
    process.exit(1)
  }
  process.chdir(HQ)
  // As wasp's nodemon starts it: always development mode (its nodemon.json sets it), the server's own .env read by
  // dotenv under the environment.
  const server = spawn(process.execPath, ['--enable-source-maps', '-r', 'dotenv/config', 'bundle/server.js'], {
    cwd: SERVER,
    stdio: 'inherit',
    env: { ...process.env, NODE_ENV: 'development' },
  })
  const vite = await startVite()
  const stop = async (code) => {
    server.kill('SIGTERM')
    // Removed first: a stop that escalates to SIGKILL while Vite closes would leave it behind.
    rmSync(vite.cacheDir, { recursive: true, force: true })
    await Promise.race([vite.server.close().catch(() => {}), sleep(5000)])
    process.exit(code)
  }
  server.on('exit', (code) => {
    console.error(`[hq-built] hq's server exited (${code})`)
    void stop(code ?? 1)
  })
  for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => void stop(0))
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--build')) build()
  else await main()
}
